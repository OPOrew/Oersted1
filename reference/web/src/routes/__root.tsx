import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "../styles.css?url";
import "leaflet/dist/leaflet.css";

const APP_NAME = "Classic 737 Line Lab";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Interactive Boeing 737-200 AMM systems trainer — airplane layout, overhead switches, and live indicators.",
      },
      { name: "theme-color", content: "#0a0c0e" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      // Fonts must not block first paint: connect early, load the stylesheet as "print" and switch it to "all" once it arrives.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        id: "app-fonts",
        rel: "stylesheet",
        media: "print",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
    ],
    scripts: [
      // Offline / fast-load cache (public/sw.js). Production only, so development never serves stale files.
      ...(import.meta.env.PROD
        ? [
            {
              children:
                "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
            },
          ]
        : []),
      {
        children:
          "(function(){var l=document.getElementById('app-fonts');if(!l)return;function a(){l.media='all'}if(l.sheet)a();else l.addEventListener('load',a);setTimeout(a,4000)})()",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  ),
});
