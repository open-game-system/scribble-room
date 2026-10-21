// Lets inline styles set CSS custom properties (style={{ "--p": 0.5 }}) without casts.
import "react";

declare module "react" {
  interface CSSProperties {
    [name: `--${string}`]: string | number | undefined;
  }
}
