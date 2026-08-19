import React, { useEffect, useState } from 'react'
import axios from 'axios'
import './Dashboard.css'

const API_URL =
  process.env.REACT_APP_API_URL || '/api'

export default function Dashboard() {
  const [conges, setConges] = useState(null)
  const [loading, setLoading] = useState(true)

  const token = localStorage.getItem('hrflow_token')
  const user = JSON.parse(
    localStorage.getItem('hrflow_user') || '{}'
  )

  useEffect(() => {
    if (!token) {
      window.location.href = '/'
      return
    }

    axios
      .get(`${API_URL}/conges/solde/${user.id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      .then(r => setConges(r.data))
      .catch(err => {
        console.error('Erreur récupération congés:', err)

        // Si le token est expiré
        if (err.response?.status === 401) {
          localStorage.removeItem('hrflow_token')
          localStorage.removeItem('hrflow_user')
          window.location.href = '/'
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('hrflow_token')
    localStorage.removeItem('hrflow_user')
    window.location.href = '/'
  }

  return (
    <div className="dashboard">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          HRFlow<span>.</span>
        </div>

        <nav>
          <a href="/dashboard" className="active">
            <span>▦</span>
            Dashboard
          </a>

          <a>
            <span>◷</span>
            Congés
          </a>

          <a>
            <span>♙</span>
            Collaborateurs
          </a>

          <a>
            <span>▤</span>
            Documents
          </a>
        </nav>

        <button
          className="logout"
          onClick={handleLogout}
        >
          <span>↪</span>
          Déconnexion
        </button>
      </aside>

      {/* Contenu principal */}
      <main className="dashboard-content">

        {/* Header */}
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">ESPACE RH</p>
            <h1>
              Bonjour, <strong>{user.email}</strong> 👋
            </h1>
            <p className="subtitle">
              Voici un aperçu de votre espace HRFlow.
            </p>
          </div>

          <div className="avatar">
            {user.email?.charAt(0).toUpperCase() || 'U'}
          </div>
        </header>

        {/* Cards */}
        <section className="stats-grid">

          <div className="stat-card blue">
            <div className="stat-icon">◷</div>

            <div>
              <p>Solde congés</p>

              {loading ? (
                <div className="skeleton"></div>
              ) : (
                <h2>
                  {conges?.solde ?? 0}
                  <small> jours</small>
                </h2>
              )}

              <span className="stat-info">
                Jours disponibles
              </span>
            </div>
          </div>

          <div className="stat-card red">
            <div className="stat-icon">✓</div>

            <div>
              <p>Demandes</p>
              <h2>0</h2>
              <span className="stat-info">
                En attente
              </span>
            </div>
          </div>

          <div className="stat-card dark">
            <div className="stat-icon">▤</div>

            <div>
              <p>Documents</p>
              <h2>0</h2>
              <span className="stat-info">
                Documents disponibles
              </span>
            </div>
          </div>

        </section>

        {/* Activité */}
        <section className="dashboard-grid">

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">ACTIVITÉ</p>
                <h2>Dernières activités</h2>
              </div>

              <button className="see-more">
                Voir tout →
              </button>
            </div>

            <div className="empty-state">
              <div className="empty-icon">✦</div>

              <h3>Aucune activité récente</h3>

              <p>
                Vos dernières actions apparaîtront ici.
              </p>
            </div>
          </div>

          <div className="panel quick-actions">
            <div className="panel-header">
              <div>
                <p className="eyebrow">ACTIONS</p>
                <h2>Accès rapide</h2>
              </div>
            </div>

            <button>
              <span className="action-icon blue-icon">◷</span>
              <span>
                <strong>Poser un congé</strong>
                <small>Créer une demande</small>
              </span>
              <span>→</span>
            </button>

            <button>
              <span className="action-icon red-icon">▤</span>
              <span>
                <strong>Mes documents</strong>
                <small>Consulter mes documents</small>
              </span>
              <span>→</span>
            </button>
          </div>

        </section>

      </main>
    </div>
  )
}