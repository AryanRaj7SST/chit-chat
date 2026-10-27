export const notFound = (req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message || "Server error";

  if (err.type === "entity.parse.failed") { status = 400; message = "Invalid JSON body"; }
  else if (err.name === "ValidationError") { status = 400; message = "Invalid request data"; }
  else if (err.name === "CastError") { status = 400; message = "Invalid id"; }
  else if (err.code === 11000) { status = 409; message = "Email is already registered"; }

  if (status >= 500) console.error("Request failed", err.name || "Error");
  res.status(status).json({ success: false, message: status >= 500 && status !== 503 ? "Server error" : message });
};
