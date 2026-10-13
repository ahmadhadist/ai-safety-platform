import "./globals.css";
import SidebarLayout from "@/components/SidebarLayout";

export const metadata = {
  title: "SafeSight · AI Safety Inspector",
  description: "AI-Powered Safety Permitting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50">
        <SidebarLayout>{children}</SidebarLayout>
      </body>
    </html>
  );
}
