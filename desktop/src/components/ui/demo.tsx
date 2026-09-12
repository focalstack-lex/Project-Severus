import { NeuralNoise } from "@/components/ui/neural-noise";

export function DemoOne() {
  return (
    <div className="relative flex h-full w-full min-h-screen flex-col items-center justify-center overflow-hidden bg-black">
      <NeuralNoise color={[0.85, 0.85, 0.9]} opacity={0.9} speed={0.001} />
      <span className="pointer-events-none absolute z-10 text-center text-7xl leading-none font-semibold tracking-tighter whitespace-pre-wrap text-rose-500">
        Neural Noise
      </span>
    </div>
  );
}

export default DemoOne;
