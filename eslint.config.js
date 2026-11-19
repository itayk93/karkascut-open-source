import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "*.config.*"]
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["**/server/**", "../server/**", "../../server/**"],
              "message": "Client must not import from server directly."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/client/src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["**/features/**", "../features/**", "../../features/**", "**/app/**", "../app/**", "../../app/**"],
              "message": "Shared modules must not import from features or app."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["**/client/**", "../client/**", "../../client/**"],
              "message": "Server must not import from client directly."
            }
          ]
        }
      ]
    }
  }
);
