#!/usr/bin/env node

/**
 * Security audit script:
 * Ensures NO backend secrets or sensitive tokens are included in client code.
 *
 * Scans src/, src-tauri/ (excluding target/ and build output), and dist/.
 * Fails if ANTHROPIC_API_KEY, service_role, or sk-ant- appear anywhere.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const FORBIDDEN_PATTERNS = [
  { name: "ANTHROPIC_API_KEY", regex: /\bANTHROPIC_API_KEY\b/ },
  { name: "service_role", regex: /\bservice_role\b/ },
  { name: "sk-ant- prefix", regex: /sk-ant-[a-zA-Z0-9_\-]+/ },
];

const SCAN_DIRS = ["src", "src-tauri", "dist"];
const IGNORE_DIRS = new Set(["node_modules", "target", ".git", ".cargo", "dist"]);
const IGNORE_EXTS = new Set([".png", ".ico", ".icns", ".jpg", ".jpeg", ".zip", ".tar", ".gz", ".lock"]);

let violations = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        scanDir(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORE_EXTS.has(ext)) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split("\n");

        lines.forEach((line, idx) => {
          for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.regex.test(line)) {
              console.error(
                `[SECURITY VIOLATION] ${pattern.name} found in ${fullPath}:${idx + 1}`
              );
              console.error(`  > ${line.trim()}`);
              violations++;
            }
          }
        });
      } catch {
        // Skip unreadable / binary files
      }
    }
  }
}

for (const dir of SCAN_DIRS) {
  scanDir(dir);
}

if (violations > 0) {
  console.error(`\nSecurity check FAILED: ${violations} violation(s) found!`);
  process.exit(1);
} else {
  console.log("Security check PASSED: No forbidden secrets or keys in client code.");
}
