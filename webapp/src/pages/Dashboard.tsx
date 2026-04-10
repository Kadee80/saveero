/**
 * Dashboard
 *
 * Empty state for now — will be populated once the property and offer
 * backend modules are built. No mock data.
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Your properties and activity will appear here.</p>
      </div>

      {/* Empty state */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Home className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-1">No listings yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs mb-6">
            Use the listing wizard to generate your first AI-powered property listing from photos.
          </p>
          <Button onClick={() => navigate('/list-property')}>
            <PlusCircle size={16} />
            Create a listing
          </Button>
        </CardContent>
      </Card>

      {/*
        TODO: Add these panels as backend modules ship:
        - Active listings grid (api/property_routes.py)
        - Pending offers (api/offer_routes.py)
        - Notifications
        - Mortgage scenario summary (mortgage/)
      */}
    </div>
  )
}
