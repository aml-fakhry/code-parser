import { parse } from '@babel/parser';
import * as t from '@babel/types';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';
import util from 'util';

const patternCode = fs.readFileSync(path.resolve('./test/pattern.in'), {
  encoding: 'utf-8',
});

const pattern2Code = fs.readFileSync(path.resolve('./test/pattern2.in'), {
  encoding: 'utf-8',
});

// parse the code -> ast
const patternAst = parse(patternCode, {
  sourceType: 'module',

  plugins: ['typescript', 'decorators-legacy'],
});

const pattern2Ast = parse(pattern2Code, {
  sourceType: 'module',

  plugins: ['typescript', 'decorators-legacy'],
});

type MethodInfo = {
  methodDecorators: t.Decorator[];
  statements: t.Statement[];
  params: (t.Identifier | t.RestElement | t.TSParameterProperty | t.Pattern)[];
  returnArgs: (
    | t.ArgumentPlaceholder
    | t.JSXNamespacedName
    | t.SpreadElement
    | t.Expression
  )[];
};

function extractMethodInfo(curAst: t.Node): MethodInfo {
  let methodInfo: MethodInfo;
  traverse(curAst, {
    enter(path) {
      // in this example change all the variable `n` to `x`
      if (path.isClassMethod()) {
        const params = path.node.params;
        const statements = path.node?.body.body;
        const methodDecorators = path.node?.decorators
          ? path.node?.decorators
          : [];
        const returnArgs = (statements.pop() as any).argument.arguments as (
          | t.ArgumentPlaceholder
          | t.JSXNamespacedName
          | t.SpreadElement
          | t.Expression
        )[];
        methodInfo = {
          params: params,
          statements: statements,
          methodDecorators: methodDecorators,
          returnArgs,
        };
      }
    },
  });
  return methodInfo!!;
}

function getNestCommonImportSpecifiers(curAst: t.Node) {
  let specifiers: (
    | t.ImportDefaultSpecifier
    | t.ImportNamespaceSpecifier
    | t.ImportSpecifier
  )[];
  traverse(curAst, {
    enter(path) {
      if (
        path.isImportDeclaration() &&
        path.node.source.value === '@nestjs/common'
      ) {
        specifiers = path.node.specifiers;
      }
    },
  });
  return specifiers!!;
}

function getOtherImportDeclarations() {
  let imports: t.ImportDeclaration[] = [];
  traverse(patternAst, {
    enter(path) {
      if (
        path.isImportDeclaration() &&
        path.node.source.value !== '@nestjs/common'
      ) {
        imports.push(path.node);
      }
    },
  });
  return imports!!;
}

const method1Info = extractMethodInfo(patternAst);
const method2Info = extractMethodInfo(pattern2Ast);
const importSpecifiers = getNestCommonImportSpecifiers(patternAst);
const otherImports = getOtherImportDeclarations();

function hasMethodDecorator(path: any, decoratorName?: string): boolean {
  return (
    !!path &&
    path.isClassMethod() &&
    !!path.node?.decorators?.length &&
    (!decoratorName ||
      path.node?.decorators.some((decorator: any) => {
        const exp = decorator?.expression as any;
        return exp?.callee?.name === decoratorName;
      }))
  );
}

function hasLocalImport(specifiers: any[], importName: string): boolean {
  return specifiers.some((s) => s.local.name === importName);
}

const scanner = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function handleFile(filePath: string) {
  console.log(filePath);
  const code = fs.readFileSync(path.resolve(filePath), {
    encoding: 'utf-8',
  });

  const ast = parse(code, {
    sourceType: 'module',

    plugins: ['typescript', 'decorators-legacy'],
  });

  let shouldAddOtherImports = false;

  traverse(ast, {
    enter(path) {
      if (path.isClassMethod() && hasMethodDecorator(path)) {
        if (!hasMethodDecorator(path, 'UseGuards')) {
          path.node.decorators = [
            ...(path.node.decorators || []),
            ...method1Info.methodDecorators,
          ];
          const isCreate = (path.node.key as any).name === 'create';
          if (hasMethodDecorator(path, 'Get') || isCreate) {
            const methodInfo = isCreate ? method2Info : method1Info;
            path.node.body.body = [
              ...methodInfo.statements,
              ...path.node.body.body,
            ];
            path.node.params = [...methodInfo.params, ...path.node.params];
            const oldCallExp = (
              path.node.body.body[path.node.body.body.length - 1] as any
            ).argument as t.CallExpression;
            oldCallExp.arguments = [
              ...(isCreate ? [] : methodInfo.returnArgs),
              ...oldCallExp.arguments,
              ...(!isCreate ? [] : methodInfo.returnArgs),
            ];
          }
        }
      } else if (
        path.isImportDeclaration() &&
        path.node.source.value === '@nestjs/common'
      ) {
        const oldSpes = path.node.specifiers;
        if (!hasLocalImport(oldSpes, 'UseGuards')) {
          shouldAddOtherImports = true;
          path.node.specifiers = [...oldSpes, ...importSpecifiers];
        }
      }
    },
  });

  if (shouldAddOtherImports) {
    ast.program.body = [...otherImports, ...ast.program.body];
  }

  // generate code <- ast
  const output = generate(ast, { retainLines: true });
  fs.writeFileSync(filePath, output.code);
}

function question(q: string) {
  return new Promise<string>((resolve) => {
    scanner.question(q, (reply) => resolve(reply));
  });
}

async function handleInput() {
  while (true) {
    const path = await question('enter a file path >');
    handleFile(path);
    console.log('');
  }
}

handleInput();
