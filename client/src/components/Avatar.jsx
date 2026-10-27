import { getInitials } from "../utils/format";
import { useEffect, useState } from "react";
import { mediaUrl } from "../services/media";

const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" };

export default function Avatar({ name, avatar, size = "md", online }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let canceled = false; setUrl(""); if (avatar?.thumbKey) mediaUrl(avatar.thumbKey).then(value => { if (!canceled) setUrl(value); }).catch(() => {}); return () => { canceled = true; }; }, [avatar?.thumbKey]);
  return (
    <div className="relative shrink-0">
      <div
        className={`brand-gradient flex items-center justify-center rounded-full font-semibold text-on-primary ${sizes[size]}`}
      >
        {url ? <img src={url} alt={`Avatar of ${name}`} onError={() => setUrl("")} className="h-full w-full rounded-full object-cover" /> : getInitials(name)}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface  ${
            online ? "bg-online" : "bg-muted"
          }`}
        />
      )}
    </div>
  );
}
