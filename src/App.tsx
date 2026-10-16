import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { CampApp } from "@/components/camp-app";
import { CampStoreProvider } from "@/lib/camp-store";
import { AuthProvider } from "@/lib/auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { Router as WouterRouter, useLocation } from "wouter";

const queryClient=new QueryClient();

function AppRoutes(){
 const [location]=useLocation();
 return <ErrorBoundary resetKey={location}><CampApp/></ErrorBoundary>;
}
function App(){
 return <QueryClientProvider client={queryClient}><AuthProvider><TooltipProvider><CampStoreProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,"")}><AppRoutes/></WouterRouter><Toaster richColors/></CampStoreProvider></TooltipProvider></AuthProvider></QueryClientProvider>;
}
export default App;