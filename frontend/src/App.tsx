import { RouterProvider } from "react-router";
import { AuthProvider } from "./hooks/useAuth";
import { router } from "./app/routes";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
