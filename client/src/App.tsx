import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BrandRefresh2027 from "./pages/BrandRefresh2027";
import Home from "./pages/Home";

const ChamberGrowth = lazy(() => import("./pages/ChamberGrowth"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const CreditUnionUnsubscribe = lazy(
  () => import("./pages/CreditUnionUnsubscribe")
);

function Router() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f4f1e9] text-sm font-bold text-black">
          Loading secure workspace…
        </div>
      }
    >
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/2027-brand-refresh"} component={BrandRefresh2027} />
        <Route path={"/privacy-policy"} component={PrivacyPolicy} />
        <Route path={"/chamber-growth"} component={ChamberGrowth} />
        <Route
          path={"/credit-union-unsubscribe/:token"}
          component={CreditUnionUnsubscribe}
        />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
