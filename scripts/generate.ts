#!/usr/bin/env bun
/**
 * SVG Icon Generator for @skalfa/skalfa-icon
 * 
 * Reads all .svg files from the icons/ folder and generates:
 * 1. React component for each SVG (src/icons/[Name].tsx)
 * 2. Registry file mapping icon names to components (src/registry.ts)
 * 3. Index barrel export (src/icons/index.ts)
 * 
 * Usage: bun run scripts/generate.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename, resolve, relative } from "path";
import { execSync } from "child_process";



// ─── Config ─────────────────────────────────────────────────────────

const ROOT             = resolve(import.meta.dirname, "..");
const ICONS_DIR        = join(ROOT, "icons");
const SIBLING_APP_DIR  = resolve(ROOT, "../skalfa-app/icons");
const CWD_ICONS_DIR    = join(process.cwd(), "icons");

const OUTPUT_DIR   = join(ROOT, "src", "icons");
const REGISTRY_OUT = join(ROOT, "src", "registry.ts");
const ICONS_INDEX  = join(OUTPUT_DIR, "index.ts");




// ─── Helpers ────────────────────────────────────────────────────────

/** kebab-case / snake_case / slash-categorized → PascalCase  (e.g. "solid/chevron-left" → "SolidChevronLeft") */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\/]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/** kebab-case / slash-categorized → camelCase  (e.g. "solid/chevron-left" → "solidChevronLeft") */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Process SVG content:
 * - Replace hardcoded fill/stroke values with "currentColor"
 * - Replace hardcoded width/height with "1em"
 * - Convert SVG attributes to JSX (e.g. stroke-width → strokeWidth)
 */
function processSvg(raw: string): string {
  let svg = raw.trim();

  // If there is no fill="none" and no fill="..." attribute in the SVG, add fill="currentColor" to the root <svg>
  if (!svg.includes('fill="none"') && !svg.includes('fill=')) {
    svg = svg.replace('<svg', '<svg fill="currentColor"');
  }

  // Replace fill="..." (except "none") → fill="currentColor"
  svg = svg.replace(/fill="(?!none")[^"]*"/g, 'fill="currentColor"');

  // Replace stroke="..." (except "none") → stroke="currentColor"
  svg = svg.replace(/stroke="(?!none")[^"]*"/g, 'stroke="currentColor"');

  // Remove hardcoded width/height from root <svg> tag
  svg = svg.replace(/(<svg[^>]*?)\s+width="[^"]*"/i, "$1");
  svg = svg.replace(/(<svg[^>]*?)\s+height="[^"]*"/i, "$1");

  svg = svg.replace(/stroke-width=/g, "strokeWidth=");
  svg = svg.replace(/stroke-linecap=/g, "strokeLinecap=");
  svg = svg.replace(/stroke-linejoin=/g, "strokeLinejoin=");
  svg = svg.replace(/fill-rule=/g, "fillRule=");
  svg = svg.replace(/clip-rule=/g, "clipRule=");
  svg = svg.replace(/clip-path=/g, "clipPath=");
  svg = svg.replace(/stroke-dasharray=/g, "strokeDasharray=");
  svg = svg.replace(/stroke-dashoffset=/g, "strokeDashoffset=");
  svg = svg.replace(/stroke-miterlimit=/g, "strokeMiterlimit=");
  svg = svg.replace(/stroke-opacity=/g, "strokeOpacity=");
  svg = svg.replace(/fill-opacity=/g, "fillOpacity=");
  svg = svg.replace(/\bclass=/g, "className=");

  // Inject {...props} into root <svg> tag (before the closing >)
  svg = svg.replace(/<svg([^>]*)>/, '<svg$1 {...props}>');

  return svg;
}



// ─── Main ──────────────────────────────────────────────────────────

function scanSvgFiles(dir: string, baseDir: string = dir): { relativePath: string; absolutePath: string }[] {
  const results: { relativePath: string; absolutePath: string }[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanSvgFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith(".svg")) {
      const relPath = relative(baseDir, fullPath).replace(/\\/g, "/"); // always use forward slashes for cross-platform matching
      results.push({ relativePath: relPath, absolutePath: fullPath });
    }
  }
  return results;
}

function generate() {
  const isQuiet = process.argv.includes("--quiet");
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Map to store unique icons by name -> path
  const svgFilesMap = new Map<string, string>();

  // 1. Read default icons in skalfa-icon/icons
  scanSvgFiles(ICONS_DIR).forEach(file => {
    const iconName = file.relativePath.replace(/\.svg$/, "");
    svgFilesMap.set(iconName, file.absolutePath);
  });

  // 2. Read sibling skalfa-app/icons if it exists
  scanSvgFiles(SIBLING_APP_DIR).forEach(file => {
    const iconName = file.relativePath.replace(/\.svg$/, "");
    svgFilesMap.set(iconName, file.absolutePath); // overrides the default!
  });

  // 3. Read current working directory icons if different and exists
  if (process.cwd() !== ROOT) {
    scanSvgFiles(CWD_ICONS_DIR).forEach(file => {
      const iconName = file.relativePath.replace(/\.svg$/, "");
      svgFilesMap.set(iconName, file.absolutePath); // overrides!
    });
  }

  if (svgFilesMap.size === 0) {
    return;
  }

  const icons: { name: string; pascal: string; camel: string }[] = [];

  // Generate React component for each SVG
  for (const [name, path] of svgFilesMap.entries()) {
    const pascal = toPascalCase(name);          // e.g. "ChevronLeft"
    const camel  = toCamelCase(name);           // e.g. "chevronLeft"

    const raw = readFileSync(path, "utf-8");
    const svg = processSvg(raw);

    const component = `// Auto-generated by scripts/generate.ts — DO NOT EDIT
import type { SVGProps } from "react";

export function ${pascal}Icon(props: SVGProps<SVGSVGElement>) {
  return (
    ${svg}
  );
}
`;

    writeFileSync(join(OUTPUT_DIR, `${pascal}.tsx`), component);
    icons.push({ name, pascal, camel });

    if (!isQuiet) {
      console.log(`  ✓ ${name} → ${pascal}Icon`);
    }
  }


  // Generate icons/index.ts (barrel export)
  const barrelLines = icons.map(i => `export { ${i.pascal}Icon } from "./${i.pascal}";`);
  writeFileSync(ICONS_INDEX, `// Auto-generated by scripts/generate.ts — DO NOT EDIT\n${barrelLines.join("\n")}\n`);


  // Generate registry.ts
  const importLines = icons.map(i => `import { ${i.pascal}Icon } from "./icons/${i.pascal}";`);
  const registryEntries = icons.map(i => `  "${i.name}": ${i.pascal}Icon,`);

  const registryContent = `// Auto-generated by scripts/generate.ts — DO NOT EDIT
import type { ComponentType, SVGProps } from "react";

${importLines.join("\n")}

export const iconRegistry = {
${registryEntries.join("\n")}
} as const;

export type IconName = keyof typeof iconRegistry;

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
`;

  writeFileSync(REGISTRY_OUT, registryContent);


  if (!isQuiet) {
    console.log(`\n✅ Generated ${icons.length} icons`);
    console.log(`   → ${OUTPUT_DIR}`);
    console.log(`   → ${REGISTRY_OUT}`);
    console.log("\nCompiling package...");
  } else {
    console.log(`✓ Generated ${icons.length} icons`);
  }

  // Auto-compile the package so it's instantly ready to use in the parent project
  try {
    const tsconfigPath = join(ROOT, "tsconfig.json");
    const tsconfigBuildPath = join(ROOT, "tsconfig.build.json");

    if (!existsSync(tsconfigPath)) {
      writeFileSync(
        tsconfigPath,
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2021",
              module: "ES2022",
              moduleResolution: "bundler",
              declaration: true,
              sourceMap: true,
              outDir: "./dist",
              rootDir: "./src",
              strict: true,
              esModuleInterop: true,
              types: ["node"],
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              jsx: "react-jsx",
            },
            include: ["./src/**/*"],
          },
          null,
          2
        )
      );
    }

    if (!existsSync(tsconfigBuildPath)) {
      writeFileSync(
        tsconfigBuildPath,
        JSON.stringify(
          {
            extends: "./tsconfig.json",
            compilerOptions: {
              paths: {},
            },
          },
          null,
          2
        )
      );
    }

    const isWin = process.platform === "win32";
    const tscBinName = isWin ? "tsc.cmd" : "tsc";
    const tscBin = join(ROOT, "node_modules", ".bin", tscBinName);
    
    let tscCmd = `"${tscBin}"`;
    if (!existsSync(tscBin)) {
      tscCmd = "bun x tsc";
    }
    
    execSync(`${tscCmd} -p tsconfig.build.json`, { cwd: ROOT, stdio: isQuiet ? "ignore" : "inherit" });
    if (!isQuiet) {
      console.log("✓ Package compiled successfully!");
    }
  } catch (err) {
    console.error("⚠ Failed to compile package:", err.message);
  }
}

generate();
