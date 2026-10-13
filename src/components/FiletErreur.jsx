// Filet d'erreur : attrape les exceptions de rendu et les montre.
//
// Une exception dans un composant vide la page entière : l'application ne
// répond plus, et rien de ce qui est modifié ensuite n'est visible. On ne voit
// qu'une page blanche, sans le moindre mot — il faut alors recharger à l'aveugle
// en espérant que le défaut a disparu.
//
// Ce composant remplace la page blanche par un message : ce qui a échoué, où,
// et un bouton pour repartir. L'application reste utilisable, et le reste des
// écrans demeure atteignable.
//
//   ▸ Ce composant   src/components/FiletErreur.jsx
//   ▸ Utilisation    src/App.jsx

import { Component } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default class FiletErreur extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null, details: false };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, infos) {
    // En développement, la console garde la pile complète : c'est là qu'on
    // regarde en premier.
    console.error("Erreur d'affichage", erreur, infos?.componentStack);
  }

  recharger = () => window.location.reload();

  retour = () => {
    this.setState({ erreur: null });
    if (window.location.pathname !== "/") window.location.assign("/");
  };

  render() {
    const { erreur, details } = this.state;
    if (!erreur) return this.props.children;

    return (
      <div className="filet-erreur">
        <div className="filet-erreur-carte">
          <AlertTriangle size={30} />
          <h1>Un écran n'a pas pu s'afficher</h1>
          <p>
            Le reste de l'application fonctionne. Vous pouvez revenir à l'accueil ou
            recharger cette page.
          </p>

          <pre className="filet-erreur-detail">{String(erreur?.message || erreur)}</pre>
          {details ? (
            <pre className="filet-erreur-pile">{erreur?.stack || "Aucune pile disponible"}</pre>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => this.setState({ details: true })}
            >
              Voir le détail technique
            </button>
          )}

          <div className="filet-erreur-actions">
            <button type="button" className="btn btn-primary" onClick={this.recharger}>
              <RefreshCw size={15} /> Recharger la page
            </button>
            <button type="button" className="btn btn-ghost" onClick={this.retour}>
              <Home size={15} /> Retour à l&apos;accueil
            </button>
          </div>
        </div>
      </div>
    );
  }
}