import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

for (const [file, methods] of [
  ["src/camera/CameraDirector.ts", ["update", "onPointerMove"]],
  ["src/scene/FrameManager.ts", ["pick"]],
  ["src/scene/Atmosphere.ts", ["update"]],
  ["src/Gallery.ts", ["render"]],
]) {
  test(`${file}: hot paths contain no allocating expressions`, async () => {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const checked = new Set();
    function check(node) {
      assert.ok(
        !ts.isNewExpression(node) &&
          !ts.isObjectLiteralExpression(node) &&
          !ts.isArrayLiteralExpression(node) &&
          !ts.isArrowFunction(node) &&
          !ts.isFunctionExpression(node),
        `Allocation in ${file}: ${node.getText(source)}`,
      );
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        assert.ok(
          !["clone", "intersectObjects", "getBoundingClientRect"].includes(
            node.expression.name.text,
          ),
          `Allocating API in ${file}: ${node.getText(source)}`,
        );
      }
      ts.forEachChild(node, check);
    }
    function visit(node) {
      if (
        (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) &&
        node.name &&
        methods.includes(node.name.getText(source))
      ) {
        const body = ts.isMethodDeclaration(node)
          ? node.body
          : node.initializer.body;
        check(body);
        checked.add(node.name.getText(source));
      } else ts.forEachChild(node, visit);
    }
    visit(source);
    assert.deepEqual([...checked].sort(), methods.toSorted());
  });
}
