import { installBrowserErrorCapture } from "@firstfold/shared/lib/error-report";

installBrowserErrorCapture("admin", process.env.NEXT_PUBLIC_FIRSTFOLD_RELEASE);

