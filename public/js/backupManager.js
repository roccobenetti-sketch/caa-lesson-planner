/**
 * BackupManager: Esportazione e importazione in blocco di percorsi CAA
 * e archivio immagini/simboli personalizzati creati con IA,
 * con verifica e riconciliazione anti-duplicati.
 */

import { ProjectManager } from './projectManager.js?v=2.6.0';
import { CustomPictogramsManager } from './customPictogramsManager.js?v=2.6.0';

export const BackupManager = {
  /**
   * Esporta tutti i progetti e le immagini IA dell'utente in un unico file JSON.
   */
  async exportFullArchive(username = 'utente') {
    // 1. Recupera tutti i progetti completi
    const projectSummaries = await ProjectManager.listProjects();
    const fullProjects = [];

    for (const summary of projectSummaries) {
      try {
        const full = await ProjectManager.getProject(summary.id);
        if (full) fullProjects.push(full);
      } catch (e) {
        console.warn(`Impossibile includere progetto completo ${summary.id}:`, e);
      }
    }

    // 2. Recupera tutti i simboli personalizzati IA
    const customPictos = CustomPictogramsManager.getAll();

    // 3. Crea il pacchetto di archivio
    const archiveData = {
      app: 'CAALessonPlanner',
      formatVersion: '2.0',
      exportedAt: new Date().toISOString(),
      exportedBy: username,
      stats: {
        totalProjects: fullProjects.length,
        totalCustomPictograms: customPictos.length
      },
      projects: fullProjects,
      customPictograms: customPictos
    };

    const jsonStr = JSON.stringify(archiveData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    const a = document.createElement('a');
    a.href = url;
    a.download = `caa_backup_${username}_${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return archiveData.stats;
  },

  /**
   * Importa un archivio JSON con controllo rigoroso anti-duplicati.
   * - Progetti: se già presenti (stesso ID o stesso titolo/contenuto), vengono ignorati.
   * - Immagini IA: se già presenti (stesso nome e stessa immagine), vengono saltate.
   * @param {string|Object} rawContent - Stringa JSON o oggetto già parsato
   * @returns {Promise<Object>} Resoconto delle operazioni
   */
  async importArchive(rawContent) {
    let data = null;
    try {
      data = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    } catch (e) {
      throw new Error('File di backup non valido o danneggiato.');
    }

    if (!data || (!Array.isArray(data.projects) && !Array.isArray(data.customPictograms))) {
      throw new Error('Il file non contiene un archivio valido di CAA Lesson Planner.');
    }

    const report = {
      projectsImported: 0,
      projectsSkipped: 0,
      pictogramsImported: 0,
      pictogramsSkipped: 0,
      errors: []
    };

    // 1. Elaborazione Progetti con deduplicazione
    const incomingProjects = data.projects || [];
    const existingProjects = await ProjectManager.listProjects();
    const existingIds = new Set(existingProjects.map(p => p.id));
    const existingTitles = new Set(existingProjects.map(p => (p.title || '').trim().toLowerCase()));

    for (const proj of incomingProjects) {
      if (!proj || !proj.title) {
        continue;
      }

      const pTitle = (proj.title || '').trim().toLowerCase();
      const pId = proj.id;

      // Controllo duplicato: stesso ID o stesso titolo
      if ((pId && existingIds.has(pId)) || existingTitles.has(pTitle)) {
        report.projectsSkipped++;
        continue;
      }

      try {
        await ProjectManager.saveProject(proj, proj.title);
        existingIds.add(proj.id);
        existingTitles.add(pTitle);
        report.projectsImported++;
      } catch (err) {
        report.errors.push(`Errore importazione progetto "${proj.title}": ${err.message}`);
      }
    }

    // 2. Elaborazione Pittogrammi IA con deduplicazione
    const incomingPictos = data.customPictograms || [];
    const currentPictos = CustomPictogramsManager.getAll();
    const existingPictoSignatures = new Set(
      currentPictos.map(p => `${(p.name || '').trim().toUpperCase()}_${(p.imageUrl || '').slice(0, 80)}`)
    );

    for (const pic of incomingPictos) {
      if (!pic || !pic.name || !pic.imageUrl) {
        continue;
      }

      const signature = `${(pic.name || '').trim().toUpperCase()}_${(pic.imageUrl || '').slice(0, 80)}`;
      if (existingPictoSignatures.has(signature)) {
        report.pictogramsSkipped++;
        continue;
      }

      try {
        CustomPictogramsManager.save({
          name: pic.name,
          imageUrl: pic.imageUrl,
          prompt: pic.prompt || pic.name
        });
        existingPictoSignatures.add(signature);
        report.pictogramsImported++;
      } catch (err) {
        report.errors.push(`Errore importazione simbolo "${pic.name}": ${err.message}`);
      }
    }

    return report;
  }
};
