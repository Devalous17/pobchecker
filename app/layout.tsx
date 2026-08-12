import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "PoB Rating Checker", description: "Understand how realistic your Path of Building conditions are." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
