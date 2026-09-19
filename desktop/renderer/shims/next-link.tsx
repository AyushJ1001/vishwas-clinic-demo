// Stands in for `next/link` in the desktop build. Pages load locally, so a
// plain link is as fast as client-side navigation.
import type { AnchorHTMLAttributes } from "react";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

export default function Link(props: LinkProps) {
  const { prefetch, replace, scroll, ...anchorProps } = props;
  void [prefetch, replace, scroll];
  return <a {...anchorProps} />;
}
