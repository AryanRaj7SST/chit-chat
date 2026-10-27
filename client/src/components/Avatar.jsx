import { getInitials } from "../utils/format";

const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" };

export default function Avatar({ name, size = "md", online }) {
  return (
    <div className="relative shrink-0">
      <div
        className={`brand-gradient flex items-center justify-center rounded-full font-semibold text-on-primary ${sizes[size]}`}
      >
        {getInitials(name)}
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
