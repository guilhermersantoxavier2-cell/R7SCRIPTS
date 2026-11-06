process.env.NETLIFY = "true";

const serverless = require("serverless-http");
const app = require("../../server");

const serverlessHandler = serverless(app, {
  binary: ["image/*", "application/octet-stream"]
});

exports.handler = async (event, context) => {
  const { connectLambda } = await import("@netlify/blobs");
  connectLambda(event);
  return serverlessHandler(event, context);
};
