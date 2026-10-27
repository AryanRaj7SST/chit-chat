import api from "./api";

export const getFriends = () => api.get("/friends");
export const getFriendRequests = () => api.get("/friends/requests");
export const sendFriendRequest = (userId) => api.post("/friends/requests", { userId });
export const acceptFriendRequest = (id) => api.post(`/friends/requests/${id}/accept`);
export const declineFriendRequest = (id) => api.post(`/friends/requests/${id}/decline`);
export const cancelFriendRequest = (id) => api.delete(`/friends/requests/${id}`);
export const removeFriend = (userId) => api.delete(`/friends/${userId}`);
