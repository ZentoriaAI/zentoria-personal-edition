/**
 * Card Component Test Suite
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  StatCard,
} from './card';

describe('Card', () => {
  it('renders with children', () => {
    render(<Card>Card content</Card>);

    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('has rounded-lg shape', () => {
    render(<Card>Rounded Card</Card>);

    expect(screen.getByText('Rounded Card')).toHaveClass('rounded-lg');
  });

  it('has border', () => {
    render(<Card>Bordered Card</Card>);

    expect(screen.getByText('Bordered Card')).toHaveClass('border');
  });

  it('has shadow', () => {
    render(<Card>Shadow Card</Card>);

    expect(screen.getByText('Shadow Card')).toHaveClass('shadow-sm');
  });

  it('applies custom className', () => {
    render(<Card className="custom-card">Custom Card</Card>);

    const card = screen.getByText('Custom Card');
    expect(card).toHaveClass('custom-card');
    expect(card).toHaveClass('rounded-lg'); // Still has base classes
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<Card ref={ref}>Ref Card</Card>);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('CardHeader', () => {
  it('renders with children', () => {
    render(<CardHeader>Header content</CardHeader>);

    expect(screen.getByText('Header content')).toBeInTheDocument();
  });

  it('has flex column layout', () => {
    render(<CardHeader>Flex Header</CardHeader>);

    const header = screen.getByText('Flex Header');
    expect(header).toHaveClass('flex');
    expect(header).toHaveClass('flex-col');
  });

  it('has proper spacing', () => {
    render(<CardHeader>Spaced Header</CardHeader>);

    const header = screen.getByText('Spaced Header');
    expect(header).toHaveClass('space-y-1.5');
    expect(header).toHaveClass('p-6');
  });

  it('applies custom className', () => {
    render(<CardHeader className="custom-header">Custom Header</CardHeader>);

    expect(screen.getByText('Custom Header')).toHaveClass('custom-header');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<CardHeader ref={ref}>Ref Header</CardHeader>);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('CardTitle', () => {
  it('renders as h3 heading', () => {
    render(<CardTitle>Card Title</CardTitle>);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Card Title');
  });

  it('has proper text styling', () => {
    render(<CardTitle>Styled Title</CardTitle>);

    const title = screen.getByText('Styled Title');
    expect(title).toHaveClass('text-lg');
    expect(title).toHaveClass('font-semibold');
    expect(title).toHaveClass('leading-none');
    expect(title).toHaveClass('tracking-tight');
  });

  it('applies custom className', () => {
    render(<CardTitle className="custom-title">Custom Title</CardTitle>);

    expect(screen.getByText('Custom Title')).toHaveClass('custom-title');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLParagraphElement | null };

    render(<CardTitle ref={ref}>Ref Title</CardTitle>);

    expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
  });
});

describe('CardDescription', () => {
  it('renders with children', () => {
    render(<CardDescription>Description text</CardDescription>);

    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  it('renders as paragraph', () => {
    render(<CardDescription>Paragraph description</CardDescription>);

    const desc = screen.getByText('Paragraph description');
    expect(desc.tagName).toBe('P');
  });

  it('has muted text color', () => {
    render(<CardDescription>Muted description</CardDescription>);

    expect(screen.getByText('Muted description')).toHaveClass('text-muted-foreground');
  });

  it('has small text size', () => {
    render(<CardDescription>Small description</CardDescription>);

    expect(screen.getByText('Small description')).toHaveClass('text-sm');
  });

  it('applies custom className', () => {
    render(<CardDescription className="custom-desc">Custom desc</CardDescription>);

    expect(screen.getByText('Custom desc')).toHaveClass('custom-desc');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLParagraphElement | null };

    render(<CardDescription ref={ref}>Ref desc</CardDescription>);

    expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
  });
});

describe('CardContent', () => {
  it('renders with children', () => {
    render(<CardContent>Content here</CardContent>);

    expect(screen.getByText('Content here')).toBeInTheDocument();
  });

  it('has horizontal padding', () => {
    render(<CardContent>Padded content</CardContent>);

    expect(screen.getByText('Padded content')).toHaveClass('p-6');
  });

  it('has no top padding', () => {
    render(<CardContent>No top padding</CardContent>);

    expect(screen.getByText('No top padding')).toHaveClass('pt-0');
  });

  it('applies custom className', () => {
    render(<CardContent className="custom-content">Custom content</CardContent>);

    expect(screen.getByText('Custom content')).toHaveClass('custom-content');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<CardContent ref={ref}>Ref content</CardContent>);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('CardFooter', () => {
  it('renders with children', () => {
    render(<CardFooter>Footer content</CardFooter>);

    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('has flex layout', () => {
    render(<CardFooter>Flex footer</CardFooter>);

    const footer = screen.getByText('Flex footer');
    expect(footer).toHaveClass('flex');
    expect(footer).toHaveClass('items-center');
  });

  it('has horizontal padding', () => {
    render(<CardFooter>Padded footer</CardFooter>);

    expect(screen.getByText('Padded footer')).toHaveClass('p-6');
  });

  it('has no top padding', () => {
    render(<CardFooter>No top padding</CardFooter>);

    expect(screen.getByText('No top padding')).toHaveClass('pt-0');
  });

  it('applies custom className', () => {
    render(<CardFooter className="custom-footer">Custom footer</CardFooter>);

    expect(screen.getByText('Custom footer')).toHaveClass('custom-footer');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<CardFooter ref={ref}>Ref footer</CardFooter>);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('Card composition', () => {
  it('renders full card with all components', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Test Card</CardTitle>
          <CardDescription>A description of the card</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Main content goes here</p>
        </CardContent>
        <CardFooter>
          <button>Action</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByRole('heading', { name: 'Test Card' })).toBeInTheDocument();
    expect(screen.getByText('A description of the card')).toBeInTheDocument();
    expect(screen.getByText('Main content goes here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });
});

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Total Users" value={1234} />);

    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('renders string value', () => {
    render(<StatCard title="Status" value="Active" />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <StatCard title="Revenue" value="$50,000" description="This month" />
    );

    expect(screen.getByText('This month')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(
      <StatCard
        title="Files"
        value={42}
        icon={<span data-testid="icon">📁</span>}
      />
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders positive trend', () => {
    render(
      <StatCard
        title="Sales"
        value={100}
        trend={{ value: 12, label: 'vs last month', positive: true }}
      />
    );

    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toHaveClass('text-green-500');
  });

  it('renders negative trend', () => {
    render(
      <StatCard
        title="Bounces"
        value={25}
        trend={{ value: -8, label: 'vs last week', positive: false }}
      />
    );

    expect(screen.getByText('-8%')).toBeInTheDocument();
    expect(screen.getByText('-8%')).toHaveClass('text-red-500');
  });

  it('applies custom className', () => {
    render(
      <StatCard title="Custom" value={0} className="custom-stat" />
    );

    // Find the Card wrapper
    const card = screen.getByText('Custom').closest('.custom-stat');
    expect(card).toBeInTheDocument();
  });

  it('has overflow hidden', () => {
    render(<StatCard title="Overflow" value={0} />);

    const card = screen.getByText('Overflow').closest('.overflow-hidden');
    expect(card).toBeInTheDocument();
  });

  it('renders with all props', () => {
    render(
      <StatCard
        title="Complete Stat"
        value="$12,345"
        description="Monthly revenue"
        icon={<span data-testid="dollar-icon">💵</span>}
        trend={{ value: 15, label: 'increase', positive: true }}
        className="full-stat"
      />
    );

    expect(screen.getByText('Complete Stat')).toBeInTheDocument();
    expect(screen.getByText('$12,345')).toBeInTheDocument();
    expect(screen.getByText('Monthly revenue')).toBeInTheDocument();
    expect(screen.getByTestId('dollar-icon')).toBeInTheDocument();
    expect(screen.getByText('+15%')).toBeInTheDocument();
    expect(screen.getByText('increase')).toBeInTheDocument();
  });

  it('has proper title styling in header', () => {
    render(<StatCard title="Styled Title" value={0} />);

    const title = screen.getByText('Styled Title');
    expect(title).toHaveClass('text-sm');
    expect(title).toHaveClass('font-medium');
    expect(title).toHaveClass('text-muted-foreground');
  });

  it('has proper value styling', () => {
    render(<StatCard title="Value" value={999} />);

    const value = screen.getByText('999');
    expect(value).toHaveClass('text-2xl');
    expect(value).toHaveClass('font-bold');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<StatCard ref={ref} title="Ref Stat" value={0} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
