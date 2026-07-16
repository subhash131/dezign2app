import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { creem } from '@/lib/creem';

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 });
    }

    const { productId } = await request.json();

    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/projects`;
    
    const checkout = await creem.checkouts.create({
      productId,
      successUrl,
      customer: {
        email,
      },
    });
    
    return NextResponse.json({ 
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout' },
      { status: 500 }
    );
  }
}