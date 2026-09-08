import "./globals.css";
import Header from "./header";

export const metadata = {
  title: "Friendly Wager",
  description: "Unfriendly competition for terrible gamblers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}