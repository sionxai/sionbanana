import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export {};",
        shortCircuit: true
      };
    }

    if (!specifier.startsWith("@/")) {
      return nextResolve(specifier, context);
    }

    const withoutAlias = specifier.slice(2);
    const absolutePath = path.resolve(process.cwd(), withoutAlias);
    const resolvedPath = existsSync(absolutePath) ? absolutePath : `${absolutePath}.ts`;

    return nextResolve(pathToFileURL(resolvedPath).href, context);
  }
});
