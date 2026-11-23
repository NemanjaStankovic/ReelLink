import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getConnections, getRandomPuzzle } from './api/client'
import type { CatalogEntity, Puzzle } from './api/types'
import { buildGraph, findShortestPath, isValidNextEntity } from './game/graph'
import { getDifficultyTier, getEarnedCardQuality, getRewardStepLimit } from './game/difficulty'
import type { CardQuality } from './game/difficulty'
import type { Credit, GameEntity } from './game/model'
import { selectPuzzleHint, selectPuzzleHints } from './game/hints'
import type { PuzzleHint } from './game/hints'
import { readPlayerStats, recordGameResult } from './game/stats'
import type { PlayerStats } from './game/stats'
import { readCollection, recordCorrectGuess } from './game/collection'
import type { CollectedCard } from './game/collection'

interface GraphData {
  nodes: Map<string, CatalogEntity>
  credits: Map<string, Credit>
}

const entityKey = (entity: Pick<CatalogEntity, 'id' | 'kind'>) => `${entity.kind}:${entity.id}`
const toGameEntity = (entity: CatalogEntity): GameEntity => ({
  id: entityKey(entity),
  kind: entity.kind,
  name: entity.name,
})

const createGraphData = (nodes: CatalogEntity[], edges: Credit[]): GraphData => ({
  nodes: new Map(nodes.map((entity) => [entityKey(entity), entity])),
  credits: new Map(edges.map((edge) => [`${edge.mediaKind ?? 'movie'}:${edge.movieId}:${edge.actorId}`, edge])),
})

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remaining = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

const entityKindLabel = (kind: CatalogEntity['kind']) =>
  kind === 'movie' ? 'Movie' : kind === 'tv' ? 'TV Series' : 'Actor'
const cardQualityLabel = (quality: CardQuality) => quality === 'unranked' ? 'B&W' : quality.toUpperCase()

type IconName = 'dice' | 'collection' | 'timer' | 'steps' | 'trophy' | 'bulb' | 'search' | 'clapper' | 'arrow'

function Icon({ name }: { name: IconName }) {
  const shapes: Record<IconName, ReactNode> = {
    dice: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r="1.25" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="1.25" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="1.25" fill="currentColor" stroke="none" /></>,
    collection: <><rect x="5" y="4" width="15" height="17" rx="2" /><path d="M8 8h9M8 12h9M8 16h6M3 7v13a2 2 0 0 0 2 2h12" /></>,
    timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6M12 2v3" /></>,
    steps: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 6h5a5 5 0 0 1 5 5v5" /><path d="m15 14 3 3 3-3" /></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" /></>,
    bulb: <><path d="M9 18h6M10 22h4M8.5 14.5a7 7 0 1 1 7 0c-.8.6-1.2 1.4-1.3 2.5h-4.4c-.1-1.1-.5-1.9-1.3-2.5Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    clapper: <><path d="M3 9h18v12H3zM3 9l2-6h18l-2 6" /><path d="m8 3 4 6m3-6 4 6" /></>,
    arrow: <><path d="M4 12h16M14 6l6 6-6 6" /></>,
  }
  return <svg className={`icon icon-${name}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}

function EntityArtwork({ entity, className = '' }: { entity: CatalogEntity; className?: string }) {
  return entity.imageUrl
    ? <img className={className} src={entity.imageUrl} alt="" loading="lazy" />
    : <span className={`${className} artwork-placeholder ${entity.kind}`} aria-hidden="true">
      {entity.kind !== 'actor'
        ? <Icon name="clapper" />
        : <svg className="actor-placeholder-icon" viewBox="0 0 64 80" fill="currentColor">
          <circle cx="32" cy="22" r="13" />
          <path d="M7 78c1-19 10-31 25-31s24 12 25 31H7Z" />
        </svg>}
    </span>
}

function EntityDetailsContent({
  entity,
  connections,
  loadingConnections,
}: {
  entity: CatalogEntity
  connections: CatalogEntity[]
  loadingConnections: boolean
}) {
  const popularCredits = connections.filter((item) => item.kind !== 'actor').slice(0, 5)

  return (
    <>
      <div className="details-art">
        <EntityArtwork entity={entity} className="details-image" />
      </div>
      <div className="details-copy">
        <div className="details-heading">
          <div>
            <span className="details-kicker">{entity.kind === 'actor' ? 'IN THE SPOTLIGHT' : 'NOW PLAYING'}</span>
            <h2>{entity.name}</h2>
            {entity.year && <span className="details-year">
              {entity.kind === 'actor' ? 'Born' : entity.kind === 'tv' ? 'First aired' : 'Released'} {entity.year}
            </span>}
          </div>
          {entity.kind !== 'actor' && (
            <div className="tmdb-score" aria-label="TMDB rating">
              <span>TMDB SCORE</span>
              <strong>{entity.rating && entity.rating > 0 ? entity.rating.toFixed(1) : '—'}<small>/10</small></strong>
            </div>
          )}
        </div>
        <div className="details-description">
          <h3>{entity.kind === 'actor' ? 'Biography' : 'Overview'}</h3>
          <p>{entity.description.trim() || `No ${entity.kind === 'actor' ? 'biography' : 'overview'} is available from TMDB.`}</p>
        </div>
        {entity.kind === 'actor' && (
          <div className="popular-films">
            <h3>Popular acting credits</h3>
            {popularCredits.length > 0 ? (
              <div className="popular-film-list">
                {popularCredits.map((credit) => (
                  <div className="popular-film" key={entityKey(credit)}>
                    <EntityArtwork entity={credit} className="popular-film-art" />
                    <span>
                      <strong>{credit.name}</strong>
                      <small>{entityKindLabel(credit.kind)} · {credit.year ?? 'Year unknown'}</small>
                      {credit.character && <small>as {credit.character}</small>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-popular-films">{loadingConnections ? 'Loading filmography…' : 'No acting credits are available.'}</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

type CollectionFilter = 'all' | 'movie' | 'tv' | 'actor'
type CollectionTierFilter = 'all' | CardQuality

interface CardDetailsTarget {
  entity: CatalogEntity
  correctGuesses: number | null
}

export default function App() {
  const [view, setView] = useState<'game' | 'collection'>('game')
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [path, setPath] = useState<CatalogEntity[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [loadingPuzzle, setLoadingPuzzle] = useState(true)
  const [loadingConnections, setLoadingConnections] = useState(false)
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [hint, setHint] = useState<PuzzleHint<CatalogEntity> | null>(null)
  const [hintLoading, setHintLoading] = useState(false)
  const [hintError, setHintError] = useState('')
  const [deluxeHintOpen, setDeluxeHintOpen] = useState(false)
  const [deluxeHints, setDeluxeHints] = useState<PuzzleHint<CatalogEntity>[] | null>(null)
  const [deluxeHintLoading, setDeluxeHintLoading] = useState(false)
  const [deluxeHintError, setDeluxeHintError] = useState('')
  const [completionDismissed, setCompletionDismissed] = useState(false)
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => readPlayerStats())
  const [collection, setCollection] = useState<CollectedCard[]>(() => readCollection())
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all')
  const [collectionTierFilter, setCollectionTierFilter] = useState<CollectionTierFilter>('all')
  const [collectionSearch, setCollectionSearch] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const [selectedCard, setSelectedCard] = useState<CardDetailsTarget | null>(null)
  const [selectedCardDetails, setSelectedCardDetails] = useState<CatalogEntity | null>(null)
  const [selectedCardConnections, setSelectedCardConnections] = useState<CatalogEntity[]>([])
  const [selectedCardLoading, setSelectedCardLoading] = useState(false)
  const [selectedCardError, setSelectedCardError] = useState('')
  const connectionRequest = useRef(0)
  const hintRequest = useRef(0)
  const deluxeHintRequest = useRef(0)
  const selectedCardRequest = useRef(0)
  const completedPuzzleId = useRef<string | null>(null)
  const initialLoadStarted = useRef(false)

  const gameGraph = useMemo(() => {
    if (!graphData) return null
    const nodes = [...graphData.nodes.values()].map(toGameEntity)
    const edges = [...graphData.credits.values()]
    return buildGraph(nodes, edges)
  }, [graphData])

  const current = path.at(-1)
  const isComplete = Boolean(puzzle && current && entityKey(current) === entityKey(puzzle.target))
  const completionModalOpen = isComplete && !completionDismissed
  const anyModalOpen = completionModalOpen || deluxeHintOpen || selectedCard !== null
  const bestPath = puzzle && gameGraph
    ? findShortestPath(gameGraph, entityKey(puzzle.start), entityKey(puzzle.target))
    : null
  const shortestSteps = bestPath?.steps ?? puzzle?.shortestSteps ?? 0
  const puzzleDifficulty = puzzle ? getDifficultyTier(puzzle.shortestSteps) : null
  const rewardStepLimit = puzzle ? getRewardStepLimit(puzzle.shortestSteps) : null
  const visibleCollection = useMemo(() => {
    const query = collectionSearch.trim().toLocaleLowerCase()
    return collection
      .filter((card) => collectionFilter === 'all' || card.entity.kind === collectionFilter)
      .filter((card) => collectionTierFilter === 'all' || card.bestDifficulty === collectionTierFilter)
      .filter((card) => !query || card.entity.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => b.lastGuessedAt.localeCompare(a.lastGuessedAt))
  }, [collection, collectionFilter, collectionTierFilter, collectionSearch])

  const startPuzzle = async () => {
    setView('game')
    setSelectedCard(null)
    selectedCardRequest.current++
    setLoadingPuzzle(true)
    setError('')
    setConnectionError('')
    setHint(null)
    setHintError('')
    setHintLoading(false)
    setDeluxeHintOpen(false)
    setDeluxeHints(null)
    setDeluxeHintError('')
    setDeluxeHintLoading(false)
    setCompletionDismissed(false)
    hintRequest.current++
    deluxeHintRequest.current++
    setFilter('')
    setPuzzle(null)
    setGraphData(null)
    setPath([])
    try {
      const next = await getRandomPuzzle()
      setPuzzle(next)
      setGraphData(createGraphData(
        next.graph.nodes,
        next.graph.edges.map(({ movieId, actorId, mediaKind }) => ({ movieId, actorId, mediaKind })),
      ))
      setPath([next.start])
      setStartedAt(Date.now())
      setElapsedSeconds(0)
      completedPuzzleId.current = null
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load a puzzle.')
    } finally {
      setLoadingPuzzle(false)
    }
  }

  useEffect(() => {
    if (initialLoadStarted.current) return
    initialLoadStarted.current = true
    void startPuzzle()
  }, [])

  useEffect(() => {
    if (startedAt === null || isComplete) return
    const updateTime = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    updateTime()
    const interval = window.setInterval(updateTime, 1000)
    return () => window.clearInterval(interval)
  }, [startedAt, isComplete])

  useEffect(() => {
    if (!current) return
    const requestId = ++connectionRequest.current
    setLoadingConnections(true)
    setConnectionError('')
    getConnections(current.kind, current.id)
      .then(({ entity: currentEntity, connections }) => {
        if (connectionRequest.current !== requestId) return
        setGraphData((previous) => {
          if (!previous) return previous
          const nodes = new Map(previous.nodes)
          const credits = new Map(previous.credits)
          nodes.set(entityKey(currentEntity), currentEntity)
          for (const connection of connections) {
            nodes.set(entityKey(connection), connection)
            const media = current.kind === 'actor' ? connection : current
            const actor = current.kind === 'actor' ? current : connection
            if (media.kind === 'actor' || actor.kind !== 'actor') continue
            const credit: Credit = { mediaKind: media.kind, movieId: media.id, actorId: actor.id }
            credits.set(`${credit.mediaKind}:${credit.movieId}:${credit.actorId}`, credit)
          }
          return { nodes, credits }
        })
        setPath((previous) => previous.map((item) =>
          entityKey(item) === entityKey(currentEntity) ? currentEntity : item,
        ))
      })
      .catch((requestError: unknown) => {
        if (connectionRequest.current !== requestId) return
        setConnectionError(requestError instanceof Error ? requestError.message : 'Could not load connections.')
      })
      .finally(() => {
        if (connectionRequest.current === requestId) setLoadingConnections(false)
      })
  }, [current?.id, current?.kind])

  useEffect(() => {
    if (!isComplete || !puzzle || completedPuzzleId.current === puzzle.id) return
    completedPuzzleId.current = puzzle.id
    setPlayerStats(recordGameResult(window.localStorage, {
      steps: path.length - 1,
      shortestSteps,
      seconds: elapsedSeconds,
      completedAt: new Date().toISOString(),
    }))
  }, [isComplete, puzzle, path.length, shortestSteps, elapsedSeconds])

  const connectedEntities = current && gameGraph && graphData
    ? [...(gameGraph.neighbors.get(entityKey(current)) ?? [])]
      .map((id) => graphData.nodes.get(id))
      .filter((entity): entity is CatalogEntity => Boolean(entity))
      .sort((a, b) => b.popularity - a.popularity)
    : []
  const neighbors = connectedEntities.filter((entity) =>
    entity.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
  )

  const chooseEntity = (entity: CatalogEntity) => {
    if (!gameGraph || !current || isComplete) return
    if (!isValidNextEntity(gameGraph, path.map(toGameEntity), entityKey(entity))) return
    setPath((previous) => [...previous, entity])
    setFilter('')
    if (!puzzle || entityKey(entity) !== entityKey(puzzle.target)) return
    const earnedQuality = getEarnedCardQuality(puzzle.shortestSteps, path.length)
    if (!earnedQuality) {
      setCollectionError('Could not save your collection: this puzzle has no supported difficulty tier.')
      return
    }
    try {
      setCollection(recordCorrectGuess(window.localStorage, entity, earnedQuality))
      setCollectionError('')
    } catch (requestError) {
      setCollectionError(requestError instanceof Error
        ? `Could not save your collection: ${requestError.message}`
        : 'Could not save your collection.')
    }
  }

  const openCollectedCard = async (card: CardDetailsTarget) => {
    const requestId = ++selectedCardRequest.current
    setSelectedCard(card)
    setSelectedCardDetails(null)
    setSelectedCardConnections([])
    setSelectedCardError('')
    setSelectedCardLoading(true)
    try {
      const details = await getConnections(card.entity.kind, card.entity.id)
      if (selectedCardRequest.current !== requestId) return
      setSelectedCardDetails(details.entity)
      setSelectedCardConnections(details.connections)
    } catch (requestError) {
      if (selectedCardRequest.current !== requestId) return
      setSelectedCardError(requestError instanceof Error ? requestError.message : 'Could not load card details.')
    } finally {
      if (selectedCardRequest.current === requestId) setSelectedCardLoading(false)
    }
  }

  const closeCollectedCard = () => {
    selectedCardRequest.current++
    setSelectedCard(null)
  }

  const openPuzzleDestinationDetails = () => {
    if (!puzzle) return
    const savedCard = collection.find((card) => entityKey(card.entity) === entityKey(puzzle.target))
    void openCollectedCard({
      entity: puzzle.target,
      correctGuesses: savedCard?.correctGuesses ?? null,
    })
  }

  const rewindTo = (index: number) => {
    if (isComplete) return
    setPath((previous) => previous.slice(0, index + 1))
  }

  const revealHint = async () => {
    if (!puzzle || hint || hintLoading) return
    const requestId = ++hintRequest.current
    setHintError('')
    setHintLoading(true)
    try {
      const { connections } = await getConnections(puzzle.target.kind, puzzle.target.id)
      if (hintRequest.current !== requestId) return
      const suggestion = selectPuzzleHint(puzzle.target, connections)
      if (!suggestion) {
        setHintError('No destination credits are available for a hint.')
        return
      }
      setHint(suggestion)
    } catch (requestError) {
      if (hintRequest.current !== requestId) return
      setHintError(requestError instanceof Error ? requestError.message : 'Could not load a hint.')
    } finally {
      if (hintRequest.current === requestId) setHintLoading(false)
    }
  }

  const revealDeluxeHint = async () => {
    setDeluxeHintOpen(true)
    if (!puzzle || deluxeHints !== null || deluxeHintLoading) return

    const requestId = ++deluxeHintRequest.current
    setDeluxeHintError('')
    setDeluxeHintLoading(true)
    try {
      const { connections } = await getConnections(puzzle.target.kind, puzzle.target.id)
      if (deluxeHintRequest.current !== requestId) return
      setDeluxeHints(selectPuzzleHints(puzzle.target, connections))
    } catch (requestError) {
      if (deluxeHintRequest.current !== requestId) return
      setDeluxeHintError(requestError instanceof Error ? requestError.message : 'Could not load deluxe hints.')
    } finally {
      if (deluxeHintRequest.current === requestId) setDeluxeHintLoading(false)
    }
  }

  useEffect(() => {
    if (!deluxeHintOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeluxeHintOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [deluxeHintOpen])

  useEffect(() => {
    if (!selectedCard) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCollectedCard()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedCard])

  useEffect(() => {
    if (!anyModalOpen) return
    const bodyOverflow = document.body.style.overflow
    const documentOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = documentOverflow
    }
  }, [anyModalOpen])

  return (
    <div className="app-shell">
      <div className="cinema-backdrop" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="ReelLink home">
          <span className="brand-mark"><img className="brand-logo" src="/reellink-logo.png?v=2" alt="" /></span>
          <span className="brand-copy"><strong>ReelLink</strong><small>Connect the stars!</small></span>
        </a>
        <nav className="site-nav" aria-label="Game navigation">
          <button className={`nav-button ${view === 'game' ? 'active' : ''}`} onClick={() => void startPuzzle()} disabled={loadingPuzzle}>
            <Icon name="dice" /><span>Random puzzle</span>
          </button>
          <button className={`nav-button ${view === 'collection' ? 'active' : ''}`} onClick={() => setView('collection')}>
            <Icon name="collection" /><span>Collection</span>
          </button>
        </nav>
      </header>

      <main className="game-page">
        {collectionError && <p className="collection-storage-error" role="alert">{collectionError}</p>}
        {view === 'collection' ? (
          <section className="collection-page">
            <header className="collection-heading">
              <div>
                <p className="collection-kicker">YOUR REELLINK COLLECTION</p>
                <h1>Every connection counts.</h1>
                <p>Movies, TV series, and actors you’ve correctly connected in your puzzles.</p>
              </div>
              <div className="collection-total">
                <strong>{collection.length}</strong>
                <span>{collection.length === 1 ? 'unique card' : 'unique cards'}</span>
              </div>
            </header>

            <div className="collection-toolbar">
              <div className="collection-filter-groups">
                <div className="collection-filters" role="group" aria-label="Filter collection by type">
                  {([
                    ['all', 'All', collection.length],
                    ['movie', 'Movies', collection.filter((card) => card.entity.kind === 'movie').length],
                    ['tv', 'TV Series', collection.filter((card) => card.entity.kind === 'tv').length],
                    ['actor', 'Actors', collection.filter((card) => card.entity.kind === 'actor').length],
                  ] as const).map(([kind, label, count]) => (
                    <button
                      key={kind}
                      className={`collection-filter ${collectionFilter === kind ? 'active' : ''}`}
                      onClick={() => setCollectionFilter(kind)}
                      aria-pressed={collectionFilter === kind}
                    >
                      {label}<span>{count}</span>
                    </button>
                  ))}
                </div>
                <div className="collection-filters collection-tier-filters" role="group" aria-label="Filter collection by highest tier">
                  {([
                    ['all', 'All tiers', collection.length],
                    ['bronze', 'Bronze', collection.filter((card) => card.bestDifficulty === 'bronze').length],
                    ['silver', 'Silver', collection.filter((card) => card.bestDifficulty === 'silver').length],
                    ['gold', 'Gold', collection.filter((card) => card.bestDifficulty === 'gold').length],
                    ['unranked', 'B&W', collection.filter((card) => card.bestDifficulty === 'unranked').length],
                  ] as const).map(([tier, label, count]) => (
                    <button
                      key={tier}
                      className={`collection-filter collection-tier-filter${tier !== 'all' ? ` difficulty-${tier}` : ''} ${collectionTierFilter === tier ? 'active' : ''}`}
                      onClick={() => setCollectionTierFilter(tier)}
                      aria-pressed={collectionTierFilter === tier}
                    >
                      {label}<span>{count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="search-field collection-search">
                <Icon name="search" />
                <input
                  value={collectionSearch}
                  onChange={(event) => setCollectionSearch(event.target.value)}
                  placeholder="Search your collection…"
                  aria-label="Search collection"
                />
                {collectionSearch && <button aria-label="Clear collection search" onClick={() => setCollectionSearch('')}>×</button>}
              </label>
            </div>

            {collection.length === 0 ? (
              <div className="collection-empty">
                <Icon name="collection" />
                <h2>Your collection is waiting.</h2>
                <p>Every actor, movie, or TV series you correctly connect will be saved here.</p>
                <button className="button button-gold" onClick={() => void startPuzzle()}>Start a puzzle</button>
              </div>
            ) : visibleCollection.length === 0 ? (
              <div className="collection-empty">
                <h2>No matching cards</h2>
                <p>Try a different search or collection filter.</p>
              </div>
            ) : (
              <div className="collection-grid">
                {visibleCollection.map((card) => (
                  <button
                    className={`collection-card difficulty-${card.bestDifficulty}`}
                    key={entityKey(card.entity)}
                    onClick={() => void openCollectedCard(card)}
                    aria-label={`${card.entity.name}, ${card.correctGuesses} correct ${card.correctGuesses === 1 ? 'guess' : 'guesses'}, best quality ${cardQualityLabel(card.bestDifficulty)}`}
                  >
                    <EntityArtwork entity={card.entity} className="collection-card-artwork" />
                    <span className="collection-card-shade" />
                    <span className="collection-card-kind">{entityKindLabel(card.entity.kind)}</span>
                    <span className={`collection-tier-badge difficulty-${card.bestDifficulty}`}>
                      {cardQualityLabel(card.bestDifficulty)}
                    </span>
                    <span className="collection-card-title">{card.entity.name}</span>
                    <span className="collection-guess-count" title={`${card.correctGuesses} correct ${card.correctGuesses === 1 ? 'guess' : 'guesses'}`}>
                      {card.correctGuesses > 99 ? '99+' : card.correctGuesses}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : error ? (
          <section className="error-panel" role="alert">
            <div className="error-icon">!</div>
            <div>
              <h2>Couldn’t load a puzzle</h2>
              <p>{error}</p>
              {error.includes('not configured') && (
                <p className="setup-hint">Add your TMDB API key to <code>.env</code> (see <code>.env.example</code>), then restart the app.</p>
              )}
              <button className="button button-gold" onClick={() => void startPuzzle()}>Try again</button>
            </div>
          </section>
        ) : loadingPuzzle || !puzzle || !current ? (
          <section className="loading-panel" aria-live="polite">
            <span className="spinner" />
            <p>Finding your next movie connection…</p>
          </section>
        ) : (
          <div className="game-grid">
            <section className="challenge-panel">
              <div className="challenge-topline">
                <span>YOUR NEXT CINEMA CONNECTION</span>
                <div className="challenge-actions">
                  {puzzleDifficulty ? (
                    <span className={`difficulty-badge difficulty-${puzzleDifficulty}`}>
                      {puzzleDifficulty.toUpperCase()}
                    </span>
                  ) : <span className="difficulty-badge difficulty-unranked">UNRANKED</span>}
                  <button
                    type="button"
                    className="challenge-badge"
                    onClick={() => void startPuzzle()}
                    disabled={loadingPuzzle}
                    aria-label="Get another random puzzle"
                    title="Get another random puzzle"
                  >
                    <Icon name="dice" /><span>RANDOM</span>
                  </button>
                </div>
              </div>
              <div className="challenge-layout">
                <div className="hero-entity start-entity">
                  <div className="poster-frame">
                    <EntityArtwork entity={puzzle.start} className="poster-image" />
                  </div>
                  <span className="poster-label">STARTING POINT</span>
                </div>
                <span className="hero-arrow" aria-hidden="true"><Icon name="arrow" /></span>
                <div className="goal-copy">
                  <span className="goal-badge">YOUR GOAL</span>
                  <h1>Reach <strong>{puzzle.target.name}</strong></h1>
                  <div className="goal-divider" />
                  <p>Starting from:</p>
                  <strong className="starting-title">{puzzle.start.name}</strong>
                </div>
                <span className="hero-arrow second-arrow" aria-hidden="true"><Icon name="arrow" /></span>
                <div className="hero-entity target-entity">
                  <div className={`poster-frame target-poster-frame${puzzleDifficulty ? ` difficulty-${puzzleDifficulty}` : ''}`}>
                    <EntityArtwork entity={puzzle.target} className="poster-image" />
                  </div>
                  <span className="poster-label">DESTINATION</span>
                </div>
              </div>
            </section>

            <aside className="score-sidebar" aria-label="Game scores">
              <section className="score-card timer-card">
                <div className="score-heading"><Icon name="timer" /><span>Time</span></div>
                <strong className="timer-value">{formatTime(elapsedSeconds)}</strong>
              </section>
              <section className="score-card steps-card">
                <div className="score-heading"><Icon name="steps" /><span>Steps</span></div>
                <strong className="steps-value">{path.length - 1}<span> / {rewardStepLimit ?? '—'}</span></strong>
                <small className="steps-reward-note">
                  {puzzleDifficulty && rewardStepLimit !== null
                    ? <>Finish in {rewardStepLimit} steps or fewer for a <b className={`difficulty-${puzzleDifficulty}`}>{puzzleDifficulty.toUpperCase()}</b> card; otherwise, B&amp;W.</>
                    : 'This puzzle has no card tier.'}
                </small>
              </section>
              <section className="score-card best-card" id="scores">
                <div className="score-heading"><Icon name="trophy" /><span>Best score</span></div>
                {playerStats.bestSteps === null ? (
                  <p className="no-score">Complete a round to set your best.</p>
                ) : (
                  <div className="best-result">
                    <strong>{playerStats.bestSteps} <span>steps</span></strong>
                    <b>{playerStats.bestTimeSeconds === null ? '—' : formatTime(playerStats.bestTimeSeconds)}</b>
                  </div>
                )}
              </section>
              <section className="score-card hint-card">
                <div className="score-heading"><Icon name="bulb" /><span>Hint</span></div>
                {!hint && !hintLoading && !hintError && (
                  <>
                    <p>Want a clue about your destination?</p>
                    <button className="hint-button" onClick={() => void revealHint()} disabled={loadingPuzzle}>
                      Hint <Icon name="arrow" />
                    </button>
                  </>
                )}
                {hintLoading && <p className="hint-status"><span className="spinner small" /> Finding a clue…</p>}
                {hintError && (
                  <div className="hint-error" role="status">
                    <p>{hintError}</p>
                    <button className="hint-button" onClick={() => void revealHint()}>Try again</button>
                  </div>
                )}
                {hint && (
                  <div className="hint-result" role="status">
                    <small>{hint.kind === 'popular-film' ? 'POPULAR CREDIT' : 'TOP-BILLED ACTOR'}</small>
                    <div className="hint-entity">
                      <EntityArtwork entity={hint.entity} className="hint-artwork" />
                      <span>
                        <strong>{hint.entity.name}</strong>
                        <small>{entityKindLabel(hint.entity.kind)}{hint.entity.year ? ` · ${hint.entity.year}` : ''}</small>
                      </span>
                    </div>
                    <p>This clue doesn’t add a step.</p>
                  </div>
                )}
                <button
                  className="hint-button deluxe-hint-trigger"
                  onClick={() => void revealDeluxeHint()}
                  disabled={loadingPuzzle}
                >
                  Gold Hint <Icon name="arrow" />
                </button>
              </section>
            </aside>

            <section className="cast-panel">
              <div className="cast-heading">
                <div className="cast-title">
                  <Icon name="clapper" />
                  <div>
                    <h2>Which {current.kind === 'actor' ? 'movie or TV series' : 'actor'} would you like to choose?</h2>
                    <p>{current.kind === 'actor'
                      ? `Choose an acting credit from ${current.name}'s filmography.`
                      : `Pick someone from ${current.name}'s cast.`}</p>
                  </div>
                </div>
                <label className="search-field">
                  <Icon name="search" />
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder={`Search ${current.kind === 'actor' ? 'filmography' : 'cast'}…`}
                    aria-label={`Search ${current.kind === 'actor' ? 'filmography' : 'cast'}`}
                  />
                  {filter && <button aria-label="Clear search" onClick={() => setFilter('')}>×</button>}
                </label>
              </div>

              <div className="route-history" aria-label="Current path">
                <span className="route-label">YOUR PATH</span>
                <div className="route-chips">
                  {path.map((entity, index) => (
                    <span className="route-stop" key={`${entityKey(entity)}-${index}`}>
                      <button
                        className={`route-chip ${index === path.length - 1 ? 'current' : ''}`}
                        onClick={() => index < path.length - 1 && rewindTo(index)}
                        disabled={index === path.length - 1 || isComplete}
                        aria-label={index < path.length - 1 ? `Return to ${entity.name}` : `Current: ${entity.name}`}
                      >
                        <EntityArtwork entity={entity} className="route-thumbnail" />
                        <span>{entity.name}</span>
                      </button>
                      {index < path.length - 1 && <span className="route-arrow" aria-hidden="true">›</span>}
                    </span>
                  ))}
                </div>
              </div>

              {connectionError && <p className="inline-error" role="status">{connectionError} Showing known connections.</p>}
              <div className="connection-grid">
                {loadingConnections && neighbors.length === 0 ? (
                  <div className="list-loading"><span className="spinner small" /> Loading connections…</div>
                ) : neighbors.length === 0 ? (
                  <div className="empty-list">{filter ? 'No matching connections.' : 'No connections available for this entity.'}</div>
                ) : neighbors.map((entity) => (
                  <button
                    className="connection-card"
                    key={entityKey(entity)}
                    onClick={() => chooseEntity(entity)}
                    aria-label={`Choose ${entityKindLabel(entity.kind)} ${entity.name}`}
                  >
                    <EntityArtwork entity={entity} className="connection-artwork" />
                    <span className="connection-caption">
                      <strong>{entity.name}</strong>
                      <small>{entityKindLabel(entity.kind)}{entity.year ? ` · ${entity.year}` : ''}</small>
                      {entity.character && <small className="connection-character">as {entity.character}</small>}
                    </span>
                    <span className="connection-card-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              <div className="data-note"><span>ⓘ</span> Connections use available TMDB credits; some cast and filmography data may be incomplete.</div>
            </section>

          </div>
        )}

        <footer className="footer">
          <span><img className="footer-logo" src="/reellink-logo.png?v=2" alt="" /> REELLINK</span>
          <span>Made for people who love the movies.</span>
          <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
        </footer>
      </main>

      {completionModalOpen && puzzle && (
        <div className="modal-backdrop" role="presentation">
          <section className="completion-modal" role="dialog" aria-modal="true" aria-labelledby="completion-title">
            <div className="completion-star">✦</div>
            <p className="eyebrow">Connection made</p>
            <h2 id="completion-title">That’s a wrap.</h2>
            <p className="completion-copy">You linked {puzzle.start.name} to {puzzle.target.name}.</p>
            <div className="completion-stats">
              <div><small>YOUR STEPS</small><strong>{path.length - 1}</strong></div>
              <div><small>SHORTEST KNOWN</small><strong>{shortestSteps}</strong></div>
              <div><small>TIME</small><strong>{formatTime(elapsedSeconds)}</strong></div>
            </div>
            <p className="personal-best-note">
              {playerStats.gamesPlayed} {playerStats.gamesPlayed === 1 ? 'game' : 'games'} played · {playerStats.optimalGames} optimal
            </p>
            <div className={`optimality ${path.length - 1 === shortestSteps ? 'optimal' : ''}`}>
              {path.length - 1 === shortestSteps ? '✦ Optimal route!' : 'There’s a shorter route to discover.'}
            </div>
            <button className="button button-gold" onClick={() => void startPuzzle()}>Play another round <span>→</span></button>
            <button
              className="details-link"
              onClick={() => {
                setCompletionDismissed(true)
                openPuzzleDestinationDetails()
              }}
            >
              View destination details <span>↗</span>
            </button>
          </section>
        </div>
      )}
      {deluxeHintOpen && puzzle && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeluxeHintOpen(false)
          }}
        >
          <section className="deluxe-hint-modal" role="dialog" aria-modal="true" aria-labelledby="deluxe-hint-title">
            <header className="deluxe-hint-header">
              <div>
                <p className="deluxe-hint-eyebrow">DELUXE HINT</p>
                <h2 id="deluxe-hint-title">
                  {puzzle.target.kind === 'actor' ? 'Popular acting credits' : 'Top-billed actors'}
                </h2>
                <p>
                  {puzzle.target.kind === 'actor'
                    ? `Explore popular movies and TV series featuring ${puzzle.target.name}.`
                    : `Explore the first-billed cast of ${puzzle.target.name}.`}
                </p>
              </div>
              <button
                className="deluxe-hint-close"
                onClick={() => setDeluxeHintOpen(false)}
                aria-label="Close deluxe hint"
                autoFocus
              >
                ×
              </button>
            </header>
            {deluxeHintLoading && <p className="deluxe-hint-message" role="status"><span className="spinner small" /> Loading suggestions…</p>}
            {deluxeHintError && (
              <div className="deluxe-hint-error" role="alert">
                <p>{deluxeHintError}</p>
                <button className="hint-button" onClick={() => void revealDeluxeHint()}>Try again</button>
              </div>
            )}
            {!deluxeHintLoading && !deluxeHintError && deluxeHints?.length === 0 && (
              <p className="deluxe-hint-message">No destination credits are available for a hint.</p>
            )}
            {!deluxeHintLoading && !deluxeHintError && deluxeHints && deluxeHints.length > 0 && (
              <ol className="deluxe-hint-list">
                {deluxeHints.map((suggestion, index) => (
                  <li className="deluxe-hint-item" key={entityKey(suggestion.entity)}>
                    <span className="deluxe-hint-rank">{index + 1}</span>
                    <EntityArtwork entity={suggestion.entity} className="deluxe-hint-artwork" />
                    <span className="deluxe-hint-copy">
                      <strong>{suggestion.entity.name}</strong>
                      <small>{entityKindLabel(suggestion.entity.kind)}{suggestion.entity.year ? ` · ${suggestion.entity.year}` : ''}</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <footer className="deluxe-hint-footer">
              <p>This clue doesn’t add a step.</p>
              <button className="button button-gold" onClick={() => setDeluxeHintOpen(false)}>Got it</button>
            </footer>
          </section>
        </div>
      )}
      {selectedCard && (
        <div
          className="modal-backdrop collection-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCollectedCard()
          }}
        >
          <section
            className="collection-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedCard.entity.name} card details`}
          >
            <header className="collection-detail-header">
              <div>
                <p className="collection-kicker">COLLECTION CARD</p>
                {selectedCard.correctGuesses !== null && (
                  <span>{selectedCard.correctGuesses} correct {selectedCard.correctGuesses === 1 ? 'guess' : 'guesses'}</span>
                )}
              </div>
              <button
                className="deluxe-hint-close"
                onClick={closeCollectedCard}
                aria-label="Close card details"
                autoFocus
              >
                ×
              </button>
            </header>
            {selectedCardLoading && (
              <div className="collection-detail-status" role="status">
                <span className="spinner small" />
                <span>Loading details for {selectedCard.entity.name}…</span>
              </div>
            )}
            {selectedCardError && (
              <div className="collection-detail-error" role="alert">
                <p>{selectedCardError}</p>
                <button className="button button-gold" onClick={() => void openCollectedCard(selectedCard)}>Try again</button>
              </div>
            )}
            {selectedCardDetails && (
              <section className="entity-details collection-detail-content" aria-live="polite">
                <EntityDetailsContent
                  entity={selectedCardDetails}
                  connections={selectedCardConnections}
                  loadingConnections={false}
                />
              </section>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
