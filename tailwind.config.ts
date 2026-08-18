import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'sans-serif'],
        /*
         * Tipografia da O.S. (ordem de serviço). Escopada: não substitui a
         * fonte base do app. `os` = texto/UI, `os-mono` = números, valores,
         * placa e número da O.S.
         */
        os: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        'os-mono': ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        /*
         * Paleta da O.S. — camada reutilizável. Hoje só as telas de O.S.
         * consomem (`bg-os-panel`, `text-os-stone`, …); as demais telas migram
         * em passos seguintes sem retrabalho. Hex direto para manter o
         * modificador de opacidade do Tailwind (`bg-os-accent/20`).
         */
        os: {
          // superfícies, do fundo para a frente
          shell: '#EDE9E3',
          panel: '#FBF9F6',
          surface: '#FFFFFF',
          subtle: '#FCFBF9',
          muted: '#F3F0EB',
          rail: '#F7F4EF',
          // linhas
          line: '#E7E2DA',
          'line-soft': '#EFEBE4',
          'line-input': '#E0DAD1',
          // tinta escura (header, card de total)
          ink: '#1C1A17',
          'ink-2': '#2B2823',
          'ink-3': '#3C3830',
          'ink-line': '#45403A',
          'ink-line-2': '#5C564D',
          // texto sobre claro
          slate: '#5C564D',
          stone: '#8B8378',
          fog: '#A9A29A',
          // texto sobre escuro
          cream: '#FBF9F6',
          'cream-2': '#CFC8BE',
          'cream-3': '#9A9186',
          // laranja (etapa atual, ação primária)
          accent: '#E2600B',
          'accent-hover': '#C2540A',
          'accent-ink': '#B4500A',
          'accent-soft': '#FEF0E3',
          'accent-glow': '#FF9942',
          'accent-glow-2': '#FFB877',
          'accent-warm': '#F0A21F',
          // teal (etapa concluída, valor recebido)
          done: '#0F766E',
          'done-ink': '#0B5F58',
          'done-soft': '#E4F2F0',
          // aviso (prazo, pagamento pendente)
          'warn-soft': '#FEF6E0',
          'warn-line': '#F3DEA6',
          'warn-ink': '#7A4405',
          'warn-icon': '#A15C07',
          'warn-dot': '#E2A008',
          // perigo (recusada, sem conserto, estorno)
          danger: '#B32222',
          'danger-ink': '#8F1D1D',
          'danger-soft': '#FDECEC',
          'danger-line': '#F1C4C4',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
