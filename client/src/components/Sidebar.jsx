import { useState } from "react";
import { LogOut, MessageCircle, Moon, Search, Sun, X } from "lucide-react";
import Avatar from "./Avatar";
import { ListSkeleton } from "./Skeletons";
import { formatListTime, getOther } from "../utils/format";

const actionClass = "rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-indigo-400 dark:hover:bg-slate-800";

export default function Sidebar({ className, me, conversations, activeId, onSelectConversation, onSelectUser,
  users, friends, requests, socialError, onRetrySocial, onFriendAction, busy,
  usersLoading, convsLoading, convsError, usersError, onRetryConversations, onRetryUsers,
  onlineIds, query, onQueryChange, onLogout }) {
  const [tab, setTab] = useState("chats");
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("chat_theme", next ? "dark" : "light"); } catch { /* Session theme still works. */ }
  };
  const searching = query.trim().length >= 2;
  const entries = conversations.map((conversation) => ({ user: getOther(conversation, me._id), conversation })).filter((entry) => entry.user);
  const existing = new Set(entries.map((entry) => entry.user._id));
  for (const user of friends) if (!existing.has(user._id)) entries.push({ user });
  entries.sort((a, b) => {
    if (!!a.user.isBot !== !!b.user.isBot) return a.user.isBot ? -1 : 1;
    const timeA = a.conversation?.lastMessage?.createdAt;
    const timeB = b.conversation?.lastMessage?.createdAt;
    if (timeA || timeB) return new Date(timeB || 0) - new Date(timeA || 0);
    return a.user.name.localeCompare(b.user.name);
  });
  const chooseTab = (value) => { setTab(value); onQueryChange(""); };
  const retryState = (error, action, label) => <div role="alert" className="space-y-2 px-4 py-3 text-sm">
    <p className="text-rose-600 dark:text-rose-400">{error}</p><button onClick={action} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">{label}</button>
  </div>;

  return (
    <aside className={`min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <div className="space-y-3 p-4 pb-2">
        <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><MessageCircle className="h-5 w-5" /></div><span className="text-lg font-semibold text-slate-900 dark:text-slate-100">MERN Chat</span></div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input aria-label="Search people" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search people by name or email" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-indigo-950" />
          {query && <button onClick={() => onQueryChange("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>}
        </div>
        {!searching && <p className="text-xs text-slate-500 dark:text-slate-400">Type at least 2 characters to find friends.</p>}
        <div role="tablist" aria-label="Friends and chats" className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
          <button role="tab" aria-selected={tab === "chats"} onClick={() => chooseTab("chats")} className={`flex-1 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === "chats" ? "border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`}>Chats</button>
          <button role="tab" aria-selected={tab === "requests"} onClick={() => chooseTab("requests")} className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === "requests" ? "border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`}>Requests {requests.incoming.length > 0 && <span aria-label={`${requests.incoming.length} incoming friend requests`} className="rounded-full bg-rose-600 px-1.5 text-xs text-white">{requests.incoming.length}</span>}</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {socialError && retryState(socialError, onRetrySocial, "Retry friend requests")}
        {searching ? (
          usersLoading ? <ListSkeleton rows={3} /> : usersError ? retryState(usersError, onRetryUsers, "Retry search") : users.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No users match your search.</p> :
          <ul aria-label="Search results">{users.map((user) => <li key={user._id} className="space-y-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-3"><Avatar name={user.name} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.maskedEmail}</p></div></div>
            <div className="flex flex-wrap gap-2">
              {user.relationship === "none" && <button disabled={busy} onClick={() => onFriendAction("add", user._id)} className={actionClass}>Add</button>}
              {user.relationship === "friends" && <button onClick={() => onSelectUser(user)} className={actionClass}>Friends</button>}
              {user.relationship === "request_sent" && <><button disabled className={actionClass}>Pending</button><button disabled={busy} onClick={() => onFriendAction("cancel", user.requestId)} className={actionClass}>Cancel</button></>}
              {user.relationship === "request_received" && <><button disabled={busy} onClick={() => onFriendAction("accept", user.requestId)} className={actionClass}>Accept</button><button disabled={busy} onClick={() => onFriendAction("decline", user.requestId)} className={actionClass}>Decline</button></>}
            </div>
          </li>)}</ul>
        ) : tab === "requests" ? (
          <div className="space-y-4 px-4 py-3">
            {[["Incoming", requests.incoming], ["Outgoing", requests.outgoing]].map(([label, items]) => <section key={label} aria-label={`${label} requests`}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</h2>
              {items.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No {label.toLowerCase()} requests.</p> : items.map((request) => <div key={request._id} className="mb-3 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="truncate text-sm font-medium">{request.user.name}</p><div className="flex flex-wrap gap-2">
                  {label === "Incoming" ? <><button disabled={busy} onClick={() => onFriendAction("accept", request._id)} className={actionClass}>Accept</button><button disabled={busy} onClick={() => onFriendAction("decline", request._id)} className={actionClass}>Decline</button></> : <button disabled={busy} onClick={() => onFriendAction("cancel", request._id)} className={actionClass}>Cancel</button>}
                </div>
              </div>)}
            </section>)}
          </div>
        ) : convsLoading ? <ListSkeleton rows={3} /> : convsError ? retryState(convsError, onRetryConversations, "Retry conversations") : entries.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Your chats are loading. Search for a friend to get started.</p> : entries.map(({ user, conversation }) => {
          const last = conversation?.lastMessage;
          const count = conversation?.unreadCount || 0;
          return <button key={user._id} onClick={() => conversation ? onSelectConversation(conversation) : onSelectUser(user)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${conversation && activeId === conversation._id ? "bg-indigo-50 dark:bg-indigo-950" : ""}`}>
            <Avatar name={user.name} online={user.isBot || onlineIds.has(user._id)} />
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{user.name}</span>{user.isBot && <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Bot</span>}{last && <span className="shrink-0 text-xs text-slate-400">{formatListTime(last.createdAt)}</span>}</div>
              <div className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${count ? "font-medium text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>{last ? `${last.sender === me._id ? "You: " : ""}${last.content}` : "No messages yet"}</span>{count > 0 && <span aria-label={`${count} unread messages`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white">{count}</span>}</div>
            </div>
          </button>;
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 p-3 dark:border-slate-800">
        <Avatar name={me.name} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{me.name}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{me.email}</p></div>
        <button onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <button onClick={onLogout} aria-label="Log out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><LogOut className="h-4 w-4" /></button>
      </div>
    </aside>
  );
}
