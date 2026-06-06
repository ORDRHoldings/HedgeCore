import { redirect } from "next/navigation";

/**
 * Root route.
 *
 * The umbrella marketing site (ORDR Terminal homepage, /products, /solutions,
 * /pricing, legal, trust, etc.) was moved out of this product repo into its own
 * standalone site. This product app now serves only the ORDR Treasury product,
 * so the root path forwards straight to the application.
 *
 * Anonymous visitors are bounced from /dashboard to /auth/login by the
 * dashboard's own auth guard, giving the chain: / → /dashboard → /auth/login.
 */
export default function RootPage() {
  redirect("/dashboard");
}
