import { getClientUrls } from "../utils/environment";

export const { apiUrl, socketUrl } = getClientUrls(import.meta.env);
