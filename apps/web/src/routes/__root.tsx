import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TooltipProvider } from "@cloudflare/kumo";
import { Shell } from "@/components/Shell";
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content: "Provision workspaces with files, tasks, work history, downloads, and a score.",
      },
      { title: "Cloudbox" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans">
        <TooltipProvider>
          <Shell>
            <Outlet />
          </Shell>
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  );
}
