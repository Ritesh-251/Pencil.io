import { Navbar } from '@/components/landing/Navbar';
import { HeroSection, FeaturesRow } from '@/components/landing/HeroSection';

export default function LandingPage() {
  return (
    <main>
      <Navbar />
      <HeroSection />
      <FeaturesRow />
    </main>
  );
}
