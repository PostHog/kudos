// The module map's skeleton of convex/website/hosting.ts, written by tools/rewrite/moduleMap/skeleton.ts. Its stubs throw
// notPorted until the stack that owns this module ports their bodies; the rest is today's code through the codemod.
const slackPictures = ["https://avatars.slack-edge.com", "https://secure.gravatar.com", "https://emoji.slack-edge.com", "https://a.slack-edge.com"].join(" ");
const companyProfileImages = "https://res.cloudinary.com";

export function contentSecurityPolicy(deploymentUrl: string | undefined, postHogHost: string | undefined) {
  const deployment = deploymentUrl ? [deploymentUrl, socketUrlOf(deploymentUrl)] : [];
  const postHog = postHogHost ? postHogOriginsOf(postHogHost) : [];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `connect-src ${["'self'", ...deployment, ...postHog].join(" ")}`,
    `img-src 'self' ${slackPictures} ${companyProfileImages}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function socketUrlOf(deploymentUrl: string) {
  return deploymentUrl.replace(/^http/, "ws");
}

const postHogCloud = /^https:\/\/(us|eu)\.i\.posthog\.com$/;

function postHogOriginsOf(host: string) {
  const origin = new URL(host).origin;
  const region = postHogCloud.exec(origin)?.[1];
  return region === undefined ? [origin] : [origin, `https://${region}-assets.i.posthog.com`];
}
