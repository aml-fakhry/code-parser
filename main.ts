import { parse } from '@babel/parser';
import * as t from '@babel/types';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import fs from 'fs';
import path from 'path';

const options = {
  sourceType: 'module',

  plugins: ['typescript', 'decorators-legacy'],
};

const patternCode = fs.readFileSync(path.resolve('./test/pattern.in'), {
  encoding: 'utf-8',
});

const code = fs.readFileSync(path.resolve('./test/input.in'), {
  encoding: 'utf-8',
});

// parse the code -> ast
const patternAst = parse(patternCode, {
  sourceType: 'module',

  plugins: ['typescript', 'decorators-legacy'],
});

function extractMethodDecorator(): t.Decorator[] {
  let decorators: t.Decorator[];
  traverse(patternAst, {
    enter(path) {
      // in this example change all the variable `n` to `x`
      if (path.isClassMethod()) {
        decorators = path.node?.decorators ? path.node?.decorators : [];
      }
    },
  });

  return decorators!!;
}

const patternMethodDecorator = extractMethodDecorator();

const ast = parse(code, {
  sourceType: 'module',

  plugins: ['typescript', 'decorators-legacy'],
});

function hasMethodDecorator(path: any, decoratorName: string): boolean {
  return (
    !!path &&
    path.isClassMethod() &&
    !!path.node?.decorators?.length &&
    path.node?.decorators.some((decorator: any) => {
      const exp = decorator?.expression as any;
      return exp?.callee?.name === decoratorName;
    })
  );
}
traverse(ast, {
  enter(path) {
    // in this example change all the variable `n` to `x`
    if (path.isClassMethod() && hasMethodDecorator(path, 'Get')) {
      if (!hasMethodDecorator(path, 'UseGuards')) {
        path.node.decorators = [
          ...patternMethodDecorator,
          ...(path.node.decorators || []),
        ];
      }
    }
  },
});

// generate code <- ast
const output = generate(ast);
fs.writeFileSync(path.resolve('./test/result.out'), output.code);
