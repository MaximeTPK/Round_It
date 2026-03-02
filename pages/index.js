import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import * as XLSX from 'xlsx'

const MapView = dynamic(() => import('../components/MapView'), { ssr: false })

const COLORS = ['#2563EB', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']
const DEPOT_KEY = 'roundit_depot'
const TRUCKS_KEY = 'roundit_trucks'

const I18N = {
  fr: {
    brand: 'RoundIT', pickingCsv: 'Picking CSV', deliveryCsv: 'Delivery CSV',
    depot: 'Dépôt', depotPlaceholder: 'Adresse du dépôt', trucks: 'Camions',
    days: 'Jours', start: 'Départ', end: 'Fin',
    optimizeAll: 'Optimiser tout →', optimizeSel: 'Optimiser ({n}) →', optimizing: '⏳ Géocodage...',
    mapPlaceholder: 'La carte apparaîtra ici', mapS
