// Stands in for `next/image` in the desktop build, which has no image
// optimisation server.
import type { ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  priority?: boolean;
  quality?: number;
};

export default function Image(props: ImageProps) {
  const { priority, quality, alt, ...imageProps } = props;
  void quality;
  // eslint-disable-next-line @next/next/no-img-element -- this is the next/image stand-in
  return <img alt={alt} loading={priority ? "eager" : "lazy"} {...imageProps} />;
}
