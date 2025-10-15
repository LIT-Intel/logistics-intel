import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle, List, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function ImportsMonitor({ jobs }) {
  const getStatusBadge = (status, errorRows) => {
    switch (status) {
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800">Processing</Badge>;
      case 'completed':
        return errorRows > 0 ? (
          <Badge className="bg-orange-100 text-orange-800">Completed with Errors</Badge>
        ) : (
          <Badge className="bg-green-100 text-green-800">Completed</Badge>
        );
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderLogs = (log, type) => {
    if (!log || log.length === 0) {
      return <p className="text-gray-500 text-sm">No {type} logs for this job.</p>;
    }
    return (
      <ul className="list-disc pl-5 space-y-1">
        {log.map((entry, index) => (
          <li key={index} className="text-sm">
            {entry}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Progress</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs && jobs.length > 0 ? jobs.map(job => (
              <TableRow key={job.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  {job.file_name}
                </TableCell>
                <TableCell>{format(new Date(job.created_date), 'MMM dd, yyyy HH:mm')}</TableCell>
                <TableCell>{getStatusBadge(job.status, job.error_rows)}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-center">
                    <Progress
                      value={job.total_rows > 0 ? (job.processed_rows / job.total_rows) * 100 : 0}
                      className="w-full h-2 mb-1"
                    />
                    <span className="text-xs text-gray-500">
                      {job.processed_rows || 0} / {job.total_rows || 0} rows
                    </span>
                    <div className="text-xs flex gap-4 mt-1">
                        <span className="text-green-600">✓ {job.success_rows || 0}</span>
                        <span className="text-red-600">✗ {job.error_rows || 0}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <List className="w-4 h-4 mr-2" />
                        View Log
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>Import Log: {job.file_name}</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto">
                        <div>
                          <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            Success Log
                          </h3>
                          <div className="p-3 bg-green-50/50 rounded-lg">
                            {renderLogs(job.success_log, 'success')}
                          </div>
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            Error Log
                          </h3>
                          <div className="p-3 bg-red-50/50 rounded-lg">
                            {renderLogs(job.error_log, 'error')}
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Close</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan="5" className="h-24 text-center">
                  No import jobs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}