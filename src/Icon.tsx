import type { SVGProps } from "react";
import { iconRegistry, type IconName } from "./registry";


export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Name of the icon (kebab-case, e.g. "chevron-left") */
  icon: IconName;
  className?: string;
  onClick?: any;
}


/**
 * Universal Icon component.
 *
 * Renders an SVG icon that behaves like text:
 * - Color follows CSS `color` (via `currentColor`)
 * - Size follows CSS `font-size` (via `width: 1em; height: 1em`)
 *
 * @example
 * ```tsx
 * import { Icon } from "@skalfa/skalfa-icon";
 *
 * <Icon icon="user" className="text-red-500 text-2xl" />
 * <Icon icon="chevron-left" style={{ fontSize: 24, color: "blue" }} />
 * ```
 */
export function Icon({ icon, style, ...props }: IconProps) {
  const SvgComponent = iconRegistry[icon];

  if (!SvgComponent) {
    if (typeof window !== "undefined") {
      console.warn(`[skalfa-icon] Icon "${icon}" not found in registry`);
    }
    return null;
  }

  return (
    <SvgComponent
      width="1em"
      height="1em"
      style={{
        display: "inline-block",
        verticalAlign: "-0.125em",
        ...style,
      }}
      {...props}
    />
  );
}
