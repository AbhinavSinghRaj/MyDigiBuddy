// lib/auth/nextauth.ts
// Auth.js (NextAuth v4) configuration.
// Handles user sign-in via Google and Facebook (Meta) OAuth,
// then stores/looks up the user in our DB via the backend.
import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    // After sign-in, call our backend to upsert the user and get a JWT.
    async signIn({ user, account }) {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            name: user.name,
            provider: account?.provider,
            providerAccountId: account?.providerAccountId,
          }),
        })
        return res.ok
      } catch {
        return false
      }
    },

    async session({ session, token }) {
      // Attach our internal userId to the session so pages can use it.
      if (token?.sub) session.user.id = token.sub
      return session
    },
  },

  pages: {
    signIn: '/auth/login',
  },
}

export default NextAuth(authOptions)
