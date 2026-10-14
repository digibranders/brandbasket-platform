import { installBrowserErrorCapture } from "@fynix/shared/lib/error-report";

installBrowserErrorCapture("admin", process.env.NEXT_PUBLIC_FYNIX_RELEASE);

