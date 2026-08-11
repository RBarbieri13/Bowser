import app from "../server.mjs";

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";

app.listen(port, host, () => {
  console.log(`Production server listening on http://${host}:${port}`);
});
