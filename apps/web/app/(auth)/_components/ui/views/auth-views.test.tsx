import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SignInView } from "./sign-in-view";
import { SignUpView } from "./sign-up-view";

// Mock convex/react
vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => vi.fn().mockResolvedValue({})),
}));

// Mock Better Auth client
vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(() => ({ data: null, isPending: false })),
  signIn: {
    email: vi.fn(),
    social: vi.fn(),
  },
  signUp: {
    email: vi.fn(),
  },
  organization: {
    create: vi.fn(),
  },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
}));

describe("Authentication Views", () => {
  describe("SignInView", () => {
    it("should render the Sign In card and fields in web mode", () => {
      render(<SignInView />);
      expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Sign In/i })).toBeInTheDocument();
    });

    it("should render browser auth and not show email signin in desktop mode", () => {
      // Mock window.electronAPI to simulate desktop app
      (window as any).electronAPI = {
        auth: {
          openBrowserLogin: vi.fn(),
          onAuthCallback: vi.fn(() => vi.fn()),
        },
      };

      render(<SignInView />);
      expect(screen.getByText(/Desktop Workspace/i)).toBeInTheDocument();
      expect(screen.getByText(/Sign In to Dezign2App/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Continue with Web Browser/i })).toBeInTheDocument();

      // Ensure direct email signin inputs/options are NOT rendered in desktop mode
      expect(screen.queryByLabelText(/^Email$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Password$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Or sign in directly/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Sign In with Password/i })).not.toBeInTheDocument();

      // Cleanup
      delete (window as any).electronAPI;
    });
  });

  describe("SignUpView", () => {
    it("should render the Sign Up card and fields in web mode", () => {
      render(<SignUpView />);
      expect(screen.getByText(/Create your account/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Create Account/i })).toBeInTheDocument();
    });

    it("should delegate to desktop browser auth in desktop mode without email sign up fields", () => {
      // Mock window.electronAPI to simulate desktop app
      (window as any).electronAPI = {
        auth: {
          openBrowserLogin: vi.fn(),
          onAuthCallback: vi.fn(() => vi.fn()),
        },
      };

      render(<SignUpView />);
      expect(screen.getByText(/Desktop Workspace/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Continue with Web Browser/i })).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Full Name$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Email$/i)).not.toBeInTheDocument();

      // Cleanup
      delete (window as any).electronAPI;
    });
  });
});
