/**
 * ListProperty — AI listing wizard
 *
 * Three steps:
 *   1. Upload photos + enter address
 *   2. Review AI-generated listing (editable)
 *   3. Confirm and save
 *
 * State lives in local React — no Zustand needed at this scale.
 * The wizard calls POST /api/listings/generate then POST /api/listings/save.
 */
import React, { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { PhotoProvider, PhotoView } from 'react-photo-view'
import { Upload, X, Loader2, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react'
import 'react-photo-view/dist/react-photo-view.css'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import { listingApi, GeneratedListing } from '@/api/listingApi'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedImage {
  file: File
  preview: string
}

interface Step1Form {
  address: string
  notes: string
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = ['Photos & Address', 'Review Listing', 'Confirm']

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                i < current  ? 'bg-primary text-primary-foreground' :
                i === current ? 'bg-primary text-primary-foreground' :
                                'bg-muted text-muted-foreground'
              )}
            >
              {i < current ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span className={cn('text-sm', i === current ? 'font-medium' : 'text-muted-foreground')}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── Step 1 — Photos + address ────────────────────────────────────────────────

function Step1({
  images, setImages, onNext,
}: {
  images: UploadedImage[]
  setImages: React.Dispatch<React.SetStateAction<UploadedImage[]>>
  onNext: (address: string, notes: string) => void
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<Step1Form>()

  const onDrop = useCallback((accepted: File[]) => {
    const newImages = accepted.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setImages(prev => [...prev, ...newImages])
  }, [setImages])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  })

  const removeImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const submit = handleSubmit(({ address, notes }) => onNext(address, notes))

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Drop zone */}
      <div>
        <Label className="mb-2 block">Property Photos</Label>
        <div
          {...getRootProps()}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isDragActive ? 'Drop photos here' : 'Drag photos here, or click to select'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP — as many as you have</p>
        </div>
      </div>

      {/* Preview grid */}
      {images.length > 0 && (
        <PhotoProvider>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {images.map((img, i) => (
              <div key={i} className="relative group aspect-square">
                <PhotoView src={img.preview}>
                  <img
                    src={img.preview}
                    alt={`upload-${i}`}
                    className="h-full w-full rounded-md object-cover cursor-pointer"
                  />
                </PhotoView>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </PhotoProvider>
      )}

      {/* Address */}
      <div className="space-y-1.5">
        <Label htmlFor="address">Property Address *</Label>
        <Input
          id="address"
          placeholder="123 Main St, Anytown, CA 12345"
          {...register('address', { required: 'Address is required' })}
        />
        {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Agent / Seller Notes <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Anything the AI should know — recent renovations, special features, pricing target…"
          {...register('notes')}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={images.length === 0}>
          Generate Listing
          <ChevronRight size={16} />
        </Button>
      </div>
    </form>
  )
}

// ─── Step 2 — Review AI output ────────────────────────────────────────────────

function Step2({
  listing, onBack, onNext,
}: {
  listing: GeneratedListing
  onBack: () => void
  onNext: (edited: GeneratedListing) => void
}) {
  // Allow basic description edits inline; full field editing can be added later
  const [description, setDescription] = useState(listing.description)

  const handleNext = () => onNext({ ...listing, description })

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{listing.title || listing.address}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{listing.address}</p>
            </div>
            {listing.recommended_price > 0 && (
              <div className="text-right shrink-0">
                <p className="text-xl font-bold">{formatCurrency(listing.recommended_price)}</p>
                {listing.price_range && (
                  <p className="text-xs text-muted-foreground">{listing.price_range}</p>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {listing.bedrooms > 0   && <span>{listing.bedrooms} bed</span>}
            {listing.bathrooms > 0  && <span>{listing.bathrooms} bath</span>}
            {listing.square_feet    && <span>{listing.square_feet.toLocaleString()} sqft</span>}
            {listing.property_type  && <span>{listing.property_type}</span>}
            {listing.year_built     && <span>Built {listing.year_built}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Description — editable */}
      <div className="space-y-1.5">
        <Label>Listing Description</Label>
        <Textarea
          rows={8}
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="font-sans text-sm leading-relaxed"
        />
      </div>

      {/* Highlights */}
      {listing.highlights.length > 0 && (
        <div className="space-y-1.5">
          <Label>Highlights</Label>
          <div className="flex flex-wrap gap-2">
            {listing.highlights.map((h, i) => (
              <Badge key={i} variant="secondary">{h}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Comparable properties */}
      {listing.similar_properties.length > 0 && (
        <div className="space-y-2">
          <Label>Comparable Properties</Label>
          <div className="space-y-2">
            {listing.similar_properties.map((prop, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{prop.address}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {prop.bedrooms}bd · {prop.bathrooms}ba
                    {prop.square_feet ? ` · ${prop.square_feet.toLocaleString()} sqft` : ''}
                  </p>
                </div>
                <p className="font-semibold">{formatCurrency(prop.price)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </Button>
        <Button onClick={handleNext}>
          Save Listing <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3 — Confirm ─────────────────────────────────────────────────────────

function Step3({ listing, onBack }: { listing: GeneratedListing; onBack: () => void }) {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await listingApi.save(listing)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <h2 className="text-xl font-semibold">Listing saved</h2>
        <p className="text-sm text-muted-foreground">Your listing has been saved successfully.</p>
        <Button onClick={() => navigate('/')}>Go to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Property</span>
            <span className="font-medium">{listing.address}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span>{listing.property_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Beds / Baths</span>
            <span>{listing.bedrooms} / {listing.bathrooms}</span>
          </div>
          {listing.recommended_price > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recommended price</span>
              <span className="font-semibold">{formatCurrency(listing.recommended_price)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ChevronLeft size={16} /> Back
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Saving…' : 'Confirm & Save'}
        </Button>
      </div>
    </div>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function ListProperty() {
  const [step, setStep] = useState(0)
  const [images, setImages] = useState<UploadedImage[]>([])
  const [listing, setListing] = useState<GeneratedListing | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStep1 = async (address: string, notes: string) => {
    setGenerating(true)
    setError(null)
    try {
      const result = await listingApi.generate({ images: images.map(i => i.file), address, notes })
      setListing(result)
      setStep(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">List a Property</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload photos and let AI generate a complete listing in seconds.
        </p>
      </div>

      <StepBar current={step} />

      {/* Generating overlay */}
      {generating && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analysing photos and generating your listing…</p>
        </div>
      )}

      {!generating && (
        <>
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === 0 && (
            <Step1 images={images} setImages={setImages} onNext={handleStep1} />
          )}
          {step === 1 && listing && (
            <Step2
              listing={listing}
              onBack={() => setStep(0)}
              onNext={edited => { setListing(edited); setStep(2) }}
            />
          )}
          {step === 2 && listing && (
            <Step3 listing={listing} onBack={() => setStep(1)} />
          )}
        </>
      )}
    </div>
  )
}
