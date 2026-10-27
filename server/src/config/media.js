import HttpError from "../utils/HttpError.js";

export const mediaEnabled = () => process.env.MEDIA_ENABLED !== "false";
export const mediaDisabledError = () => new HttpError(503, "Photo sharing is turned off on this deployment");
