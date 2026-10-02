import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Registrar from "./pages/Registrar.tsx";
import Fila from "./pages/Fila.tsx";
import Disputas from "./pages/Disputas.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Configuracoes from "./pages/Configuracoes.tsx";
import ACaminho from "./pages/ACaminho.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/registrar" element={<Registrar />} />
            <Route path="/a-caminho" element={<ACaminho />} />
            <Route path="/fila" element={<Fila />} />
            <Route path="/disputas" element={<Disputas />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
