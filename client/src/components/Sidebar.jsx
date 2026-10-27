import { useState } from "react";
import { LogOut, MessageCircle, Moon, Search, Sun, X } from "lucide-react";
import Avatar from "./Avatar";
import { ListSkeleton } from "./Skeletons";
import { formatListTime, getOther } from "../utils/format";

function SectionLabel({ children }) {
  return (
    <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>
  );
}

export default function Sidebar({
  className,
  me,
  conversations,
  activeId,
  onSelectConversation,
  onSelectUser,
  users,
  usersLoading,
  convsLoading,
  convsError,
  usersError,
  onRetryConversations,
  onRetryUsers,
  onlineIds,
  query,
  onQueryChange,
  onLogout,
}) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("chat_theme", next ? "dark" : "light"); }
    catch { /* Theme still works for this session without storage. */ }
  };
  const searching = query.trim().length > 0;
  const chatted = new Set(conversations.map((c) => getOther(c, me._id)?._id));
  const people = searching ? users : users.filter((u) => !chatted.has(u._id));

  return (
    <aside className={`min-w-0 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`}>
      <div className="space-y-3 p-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <MessageCircle className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">MERN Chat</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search people by name or email"
            aria-label="Search people"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 py-2 pl-9 pr-8 text-sm outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-950"
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {!searching && (
          <>
            <SectionLabel>Conversations</SectionLabel>
            {convsLoading ? (
              <ListSkeleton rows={3} />
            ) : convsError ? (
              <div role="alert" className="space-y-2 px-4 py-3 text-sm">
                <p className="text-rose-600 dark:text-rose-400">{convsError}</p>
                <button onClick={onRetryConversations} className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Retry conversations</button>
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                No conversations yet. Pick someone below to say hello.
              </p>
            ) : (
              conversations.map((c) => {
                const other = getOther(c, me._id);
                if (!other) return null;
                const last = c.lastMessage;
                const count = c.unreadCount || 0;
                return (
                  <button
                    key={c._id}
                    onClick={() => onSelectConversation(c)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      activeId === c._id ? "bg-indigo-50 dark:bg-indigo-950" : ""
                    }`}
                  >
                    <Avatar name={other.name} online={onlineIds.has(other._id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{other.name}</span>
                        {last && <span className="shrink-0 text-xs text-slate-400">{formatListTime(last.createdAt)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${count ? "font-medium text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>
                          {last ? `${last.sender === me._id ? "You: " : ""}${last.content}` : "No messages yet"}
                        </span>
                        {count > 0 && (
                          <span aria-label={`${count} unread messages`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white">
                            {count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </>
        )}

        <SectionLabel>{searching ? "Search results" : "People"}</SectionLabel>
        {usersLoading ? (
          <ListSkeleton rows={3} />
        ) : usersError ? (
          <div role="alert" className="space-y-2 px-4 py-3 text-sm">
            <p className="text-rose-600 dark:text-rose-400">{usersError}</p>
            <button onClick={onRetryUsers} className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Retry search</button>
          </div>
        ) : people.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
            {searching ? "No users match your search." : "No other users to show."}
          </p>
        ) : (
          people.map((u) => (
            <button
              key={u._id}
              onClick={() => onSelectUser(u)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Avatar name={u.name} online={onlineIds.has(u._id)} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{u.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-800 p-3">
        <Avatar name={me.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{me.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{me.email}</p>
        </div>
        <button
          onClick={toggleTheme}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={dark}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="shrink-0 rounded-lg p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className="rounded-lg p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
