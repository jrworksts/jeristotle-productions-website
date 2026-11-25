import { useState } from "react";

const resolutions = ["maxresdefault", "sddefault", "hqdefault"] as const;

export function youtubeThumbnailUrl(videoId: string, index = 0) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error("Invalid YouTube video identifier");
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid thumbnail index");
  }
  const resolution = resolutions[index];
  return resolution
    ? `https://i.ytimg.com/vi/${videoId}/${resolution}.jpg`
    : null;
}

export function isUsableYouTubeThumbnail(width: number, height: number) {
  // YouTube sometimes returns a small generic placeholder instead of an error.
  return width >= 320 && height >= 180;
}

function ThumbnailImage({
  videoId,
  className,
}: {
  videoId: string;
  className: string;
}) {
  const [index, setIndex] = useState(0);
  const src = youtubeThumbnailUrl(videoId, index);
  if (!src) return null;

  return (
    <img
      alt=""
      className={className}
      data-youtube-thumbnail={videoId}
      decoding="async"
      loading="lazy"
      width={1280}
      height={720}
      onError={() => setIndex(index + 1)}
      onLoad={event => {
        const image = event.currentTarget;
        if (
          !isUsableYouTubeThumbnail(image.naturalWidth, image.naturalHeight)
        ) {
          setIndex(index + 1);
        }
      }}
      src={src}
    />
  );
}

export default function YouTubeThumbnail(props: {
  videoId: string;
  className: string;
}) {
  // Reset the fallback ladder if a card is reused for a different video.
  return <ThumbnailImage key={props.videoId} {...props} />;
}
