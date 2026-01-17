/**
 * Badge Component Test Suite
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders with children', () => {
    render(<Badge>Active</Badge>);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Badge variant="default">Default</Badge>);
      const badge = screen.getByText('Default');
      expect(badge).toHaveClass('bg-zentoria-500');
      expect(badge).toHaveClass('text-white');
    });

    it('renders secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);
      const badge = screen.getByText('Secondary');
      expect(badge).toHaveClass('bg-light-surface');
    });

    it('renders destructive variant', () => {
      render(<Badge variant="destructive">Destructive</Badge>);
      const badge = screen.getByText('Destructive');
      expect(badge).toHaveClass('bg-red-500');
      expect(badge).toHaveClass('text-white');
    });

    it('renders success variant', () => {
      render(<Badge variant="success">Success</Badge>);
      const badge = screen.getByText('Success');
      expect(badge).toHaveClass('bg-green-500');
      expect(badge).toHaveClass('text-white');
    });

    it('renders warning variant', () => {
      render(<Badge variant="warning">Warning</Badge>);
      const badge = screen.getByText('Warning');
      expect(badge).toHaveClass('bg-yellow-500');
      expect(badge).toHaveClass('text-white');
    });

    it('renders outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>);
      const badge = screen.getByText('Outline');
      expect(badge).toHaveClass('text-foreground');
    });
  });

  describe('status variants', () => {
    it('renders online status', () => {
      render(<Badge variant="online">Online</Badge>);
      const badge = screen.getByText('Online');
      expect(badge).toHaveClass('bg-green-500/10');
      expect(badge).toHaveClass('text-green-500');
    });

    it('renders offline status', () => {
      render(<Badge variant="offline">Offline</Badge>);
      const badge = screen.getByText('Offline');
      expect(badge).toHaveClass('bg-gray-500/10');
      expect(badge).toHaveClass('text-gray-500');
    });

    it('renders running status', () => {
      render(<Badge variant="running">Running</Badge>);
      const badge = screen.getByText('Running');
      expect(badge).toHaveClass('bg-green-500/10');
      expect(badge).toHaveClass('text-green-500');
    });

    it('renders stopped status', () => {
      render(<Badge variant="stopped">Stopped</Badge>);
      const badge = screen.getByText('Stopped');
      expect(badge).toHaveClass('bg-gray-500/10');
      expect(badge).toHaveClass('text-gray-500');
    });

    it('renders error status', () => {
      render(<Badge variant="error">Error</Badge>);
      const badge = screen.getByText('Error');
      expect(badge).toHaveClass('bg-red-500/10');
      expect(badge).toHaveClass('text-red-500');
    });

    it('renders pending status', () => {
      render(<Badge variant="pending">Pending</Badge>);
      const badge = screen.getByText('Pending');
      expect(badge).toHaveClass('bg-yellow-500/10');
      expect(badge).toHaveClass('text-yellow-500');
    });
  });

  describe('dot prop', () => {
    it('renders without dot by default', () => {
      render(<Badge>No Dot</Badge>);
      const badge = screen.getByText('No Dot');
      // Should not have a dot element
      expect(badge.querySelector('.w-1\\.5')).not.toBeInTheDocument();
    });

    it('renders with dot when dot prop is true', () => {
      render(<Badge dot>With Dot</Badge>);
      const badge = screen.getByText('With Dot');
      // Should have a dot element
      const dot = badge.querySelector('.rounded-full');
      expect(dot).toBeInTheDocument();
    });

    it('renders green dot for online/running/success variants', () => {
      render(
        <Badge variant="online" dot>
          Online
        </Badge>
      );
      const badge = screen.getByText('Online');
      const dot = badge.querySelector('.rounded-full');
      expect(dot).toHaveClass('bg-green-500');
    });

    it('renders red dot for error/destructive variants', () => {
      render(
        <Badge variant="error" dot>
          Error
        </Badge>
      );
      const badge = screen.getByText('Error');
      const dot = badge.querySelector('.rounded-full');
      expect(dot).toHaveClass('bg-red-500');
    });

    it('renders yellow dot for warning/pending variants', () => {
      render(
        <Badge variant="warning" dot>
          Warning
        </Badge>
      );
      const badge = screen.getByText('Warning');
      const dot = badge.querySelector('.rounded-full');
      expect(dot).toHaveClass('bg-yellow-500');
    });

    it('renders gray dot for other variants', () => {
      render(
        <Badge variant="secondary" dot>
          Secondary
        </Badge>
      );
      const badge = screen.getByText('Secondary');
      const dot = badge.querySelector('.rounded-full');
      expect(dot).toHaveClass('bg-gray-500');
    });
  });

  describe('pulse prop', () => {
    it('does not pulse by default', () => {
      render(
        <Badge dot>
          No Pulse
        </Badge>
      );
      const badge = screen.getByText('No Pulse');
      const dot = badge.querySelector('.rounded-full');
      expect(dot).not.toHaveClass('animate-pulse');
    });

    it('adds pulse animation when pulse prop is true with dot', () => {
      render(
        <Badge dot pulse>
          Pulsing
        </Badge>
      );
      const badge = screen.getByText('Pulsing');
      const dot = badge.querySelector('.rounded-full');
      expect(dot).toHaveClass('animate-pulse');
    });

    it('pulse without dot has no effect', () => {
      render(<Badge pulse>No Dot Pulse</Badge>);
      const badge = screen.getByText('No Dot Pulse');
      // No dot element, so no pulse
      expect(badge.querySelector('.animate-pulse')).not.toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('merges custom className with variant classes', () => {
      render(<Badge className="custom-class">Custom</Badge>);

      const badge = screen.getByText('Custom');
      expect(badge).toHaveClass('custom-class');
      // Should still have base classes
      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('rounded-full');
    });
  });

  describe('HTML attributes', () => {
    it('passes through HTML attributes', () => {
      render(
        <Badge data-testid="test-badge" title="Badge tooltip">
          Test
        </Badge>
      );

      const badge = screen.getByTestId('test-badge');
      expect(badge).toHaveAttribute('title', 'Badge tooltip');
    });

    it('supports role attribute', () => {
      render(<Badge role="status">Status</Badge>);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('base styles', () => {
    it('has rounded-full shape', () => {
      render(<Badge>Round</Badge>);
      expect(screen.getByText('Round')).toHaveClass('rounded-full');
    });

    it('has proper padding', () => {
      render(<Badge>Padded</Badge>);
      const badge = screen.getByText('Padded');
      expect(badge).toHaveClass('px-2.5');
      expect(badge).toHaveClass('py-0.5');
    });

    it('has proper font styling', () => {
      render(<Badge>Styled</Badge>);
      const badge = screen.getByText('Styled');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('font-semibold');
    });

    it('has border', () => {
      render(<Badge>Bordered</Badge>);
      expect(screen.getByText('Bordered')).toHaveClass('border');
    });

    it('has focus ring styles', () => {
      render(<Badge>Focus</Badge>);
      const badge = screen.getByText('Focus');
      expect(badge).toHaveClass('focus:outline-none');
      expect(badge).toHaveClass('focus:ring-2');
    });
  });
});
