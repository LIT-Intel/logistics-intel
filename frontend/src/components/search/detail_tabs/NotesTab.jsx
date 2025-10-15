import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function NotesTab({ notes, onAddNote, isLoading }) {
  const [noteContent, setNoteContent] = useState('');

  const handleSubmit = () => {
    if (noteContent.trim()) {
      onAddNote(noteContent);
      setNoteContent('');
    }
  };

  if (isLoading) return <div className="text-center">Loading notes...</div>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Notes & Activity Log</h2>
      <div className="mb-4">
        <Textarea
          placeholder="Add a note about this company..."
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          className="mb-2"
        />
        <Button onClick={handleSubmit} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Note
        </Button>
      </div>

      <div className="space-y-4">
        {notes.length > 0 ? (
          notes.map(note => (
            <Card key={note.id} className="bg-gray-50">
              <CardContent className="p-4">
                <p className="text-sm">{note.content}</p>
                <div className="text-xs text-gray-500 mt-2 flex justify-between">
                  <span>by {note.created_by.split('@')[0]}</span>
                  <span>{format(new Date(note.created_date), 'MMM dd, yyyy HH:mm')}</span>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-gray-500">No notes yet.</p>
            <p className="text-sm text-gray-400 mt-1">Add a note to keep track of your interactions.</p>
          </div>
        )}
      </div>
    </div>
  );
}