import Navbar from "@/components/landing/Navbar";
import Sections from "@/components/landing/Sections";

/*
  The landing page is deliberately light-only for now: Sections.tsx and
  Navbar.tsx are built from hardcoded slate/indigo values rather than theme
  tokens, so it stays light regardless of what `next-themes` writes on <html>.
  The old `className="light"` here was removed because no `.light` selector
  exists anywhere — it did nothing. Converting the landing to tokens is a
  design pass of its own; until then this is a known, intentional limitation
  rather than a bug.
*/
export default function Home() {
    return (
        <main>
            <Navbar />
            <Sections />
        </main>
    );
}
