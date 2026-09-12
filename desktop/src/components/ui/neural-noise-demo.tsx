import { NeuralNoise } from "@/components/ui/neural-noise";

export default function NeuralNoiseDemo() {
  return (
    <div className="relative flex h-full w-full min-h-[360px] flex-col items-center justify-center overflow-hidden bg-[#070707]">
      <NeuralNoise color={[0.85, 0.85, 0.9]} opacity={0.65} speed={0.0012} />
      <span className="pointer-events-none z-10 text-center text-7xl font-semibold tracking-tighter text-white/90">
        Neural Synapses
      </span>
    </div>
  );
}
