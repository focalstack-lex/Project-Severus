# DSP Discrete Transforms

Academic note for Digital Signal Processing (DSP) core theory, focusing on Discrete Fourier Transform (DFT), Discrete Cosine Transform (DCT), and Fast Fourier Transform (FFT) algorithms.

#academic #signal-processing #dsp #mathematics #computer-engineering

Parent: [[The Glorious Evolution]], [[Lex Matondo]]

---

## 1. Mathematical Foundations & Transform Duality

### Discrete Fourier Transform (DFT)
The discrete Fourier transform maps an $N$-point time-domain sequence $x[n]$ to an $N$-point frequency-domain representation $X[k]$:

$$X[k] = \sum_{n=0}^{N-1} x[n] \cdot e^{-j \frac{2\pi}{N} k n}, \quad k = 0, 1, \dots, N-1$$

Inverse Discrete Fourier Transform (IDFT):

$$x[n] = \frac{1}{N} \sum_{k=0}^{N-1} X[k] \cdot e^{j \frac{2\pi}{N} k n}, \quad n = 0, 1, \dots, N-1$$

### Discrete Cosine Transform (DCT-II)
Used extensively in image/video compression (JPEG, H.264) due to energy compaction properties:

$$X[k] = \sum_{n=0}^{N-1} x[n] \cos \left[ \frac{\pi}{N} \left( n + \frac{1}{2} \right) k \right]$$

---

## 2. Spaced-Repetition Review Cards (Anki / RemNote Source Format)

- **Q: What is the computational complexity of direct DFT evaluation vs. Cooley-Tukey FFT?**  
  **A:** Direct DFT evaluates at $\mathcal{O}(N^2)$ complex multiplications, whereas radix-2 Cooley-Tukey FFT reduces complexity to $\mathcal{O}(N \log_2 N)$.

- **Q: Why does DCT achieve superior energy compaction for real-valued signals compared to DFT?**  
  **A:** DCT assumes even-symmetric boundary extensions, reducing high-frequency boundary discontinuities that create spectral leakage in DFT.

- **Q: What is the twiddle factor $W_N^{kn}$ in FFT decomposition?**  
  **A:** $W_N^{kn} = e^{-j \frac{2\pi}{N} kn}$, satisfying symmetry ($W_N^{k + N/2} = -W_N^k$) and periodicity ($W_N^{k+N} = W_N^k$).

---

## 3. System Integration & Graph Synthesis
- **Overdue Milestone Closure Date:** 2026-09-17 (Original Due Date: 2026-09-14).
- **Core Linkage:** Linked to [[The Glorious Evolution]], [[Lex Matondo]], and [[Self-Learning Protocol]].
